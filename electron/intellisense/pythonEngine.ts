import { spawn, type ChildProcess } from 'child_process';
import { storage } from '../storage';
import { resolvePythonBinary } from '../pathResolver';
import { EXTERNAL_LIBRARIES, getPythonImportName } from '../externalLibraries';
import type {
  IntellisenseCompletionQuery,
  IntellisenseCompletionResult,
  IntellisenseHoverQuery,
  IntellisenseHoverResult,
  IntellisenseSignatureHelpQuery,
  IntellisenseSignatureHelpResult,
} from './types';

class PythonEngine {
  private proc: ChildProcess | null = null;
  private reqId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; timer: NodeJS.Timeout }>();
  private stdoutBuffer = '';
  private startingPromise: Promise<void> | null = null;
  private lastCmd = '';

  // Daemon input: hide disabled libs, never unknown packages.
  private externalLibs = EXTERNAL_LIBRARIES.filter((l) => l.kind === 'python-pip').map((l) => ({
    id: l.id,
    importName: getPythonImportName(l),
  }));

  private withLibCatalog(payload: Record<string, unknown>): Record<string, unknown> {
    return { ...payload, externalLibs: this.externalLibs };
  }

  private daemonScript = `
import sys, os, inspect, json, builtins, ast, importlib, pkgutil, pydoc, re

def clean_doc(doc):
    if not doc:
        return ""
    return str(doc).strip()

def get_node_signature(node):
    if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return ""
    params = []
    # Positional only args
    for a in getattr(node.args, 'posonlyargs', []):
        ann = f": {ast.unparse(a.annotation)}" if a.annotation else ""
        params.append(f"{a.arg}{ann}")
    if getattr(node.args, 'posonlyargs', []):
        params.append("/")
    # Regular args
    for a in node.args.args:
        ann = f": {ast.unparse(a.annotation)}" if a.annotation else ""
        params.append(f"{a.arg}{ann}")
    # Vararg *args
    if node.args.vararg:
        ann = f": {ast.unparse(node.args.vararg.annotation)}" if node.args.vararg.annotation else ""
        params.append(f"*{node.args.vararg.arg}{ann}")
    # Kwonly args
    for a in getattr(node.args, 'kwonlyargs', []):
        ann = f": {ast.unparse(a.annotation)}" if a.annotation else ""
        params.append(f"{a.arg}{ann}")
    # Kwarg **kwargs
    if node.args.kwarg:
        ann = f": {ast.unparse(node.args.kwarg.annotation)}" if node.args.kwarg.annotation else ""
        params.append(f"**{node.args.kwarg.arg}{ann}")
    
    ret = f" -> {ast.unparse(node.returns)}" if node.returns else ""
    prefix = "async def " if isinstance(node, ast.AsyncFunctionDef) else "def "
    return f"{prefix}{node.name}({', '.join(params)}){ret}"

def parse_code(code_str, cursor_line=1):
    if not code_str:
        return {"classes": {}, "functions": {}, "variables": [], "imports": {}}
    tree = None
    try:
        tree = ast.parse(code_str)
    except SyntaxError:
        try:
            cleaned = re.sub(r'\\.\\s*$', '', code_str, flags=re.MULTILINE)
            tree = ast.parse(cleaned)
        except Exception:
            pass
        if tree is None:
            try:
                pass_cleaned = re.sub(r'^[ \\t]*[a-zA-Z0-9_]+\\.\\s*$', 'pass', code_str, flags=re.MULTILINE)
                tree = ast.parse(pass_cleaned)
            except Exception:
                pass
        if tree is None:
            lines = code_str.split('\\n')
            if 1 <= cursor_line <= len(lines):
                orig = lines[cursor_line - 1]
                indent = len(orig) - len(orig.lstrip())
                lines[cursor_line - 1] = (' ' * indent) + 'pass'
                try:
                    tree = ast.parse('\\n'.join(lines))
                except Exception:
                    pass
        if tree is None:
            return {"classes": {}, "functions": {}, "variables": [], "imports": {}}
    except Exception:
        return {"classes": {}, "functions": {}, "variables": [], "imports": {}}

    if tree is None:
        return {"classes": {}, "functions": {}, "variables": [], "imports": {}}

    classes = {}
    functions = {}
    variables = []
    imports = {}

    for node in tree.body:
        if isinstance(node, ast.Import):
            for n in node.names:
                alias = n.asname or n.name
                imports[alias] = n.name
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            for n in node.names:
                alias = n.asname or n.name
                fqn = f"{mod}.{n.name}" if mod else n.name
                imports[alias] = fqn
        elif isinstance(node, ast.ClassDef):
            c_doc = ast.get_docstring(node) or ""
            methods = {}
            fields = {}
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    m_doc = ast.get_docstring(item) or ""
                    m_sig = get_node_signature(item)
                    methods[item.name] = {
                        "name": item.name,
                        "signature": m_sig,
                        "doc": m_doc,
                        "start_line": item.lineno,
                        "end_line": getattr(item, "end_lineno", item.lineno)
                    }
                    # Check for self.field assignments inside __init__
                    if item.name == "__init__":
                        for sub in ast.walk(item):
                            if isinstance(sub, ast.Assign):
                                for target in sub.targets:
                                    if isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name) and target.value.id == "self":
                                        f_type = infer_node_type(sub.value)
                                        fields[target.attr] = {"name": target.attr, "type": f_type, "doc": f"Field of {node.name}"}
                            elif isinstance(sub, ast.AnnAssign):
                                target = sub.target
                                if isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name) and target.value.id == "self":
                                    t_str = ast.unparse(sub.annotation) if sub.annotation else ""
                                    f_type = t_str or infer_node_type(sub.value)
                                    fields[target.attr] = {"name": target.attr, "type": f_type, "detail": t_str, "doc": f"Field of {node.name}"}
                elif isinstance(item, ast.Assign):
                    for target in item.targets:
                        if isinstance(target, ast.Name):
                            fields[target.id] = {"name": target.id, "doc": f"Class attribute on {node.name}"}
                elif isinstance(item, ast.AnnAssign):
                    if isinstance(item.target, ast.Name):
                        t_str = ast.unparse(item.annotation) if item.annotation else ""
                        fields[item.target.id] = {"name": item.target.id, "detail": t_str, "doc": f"Class attribute on {node.name}"}
            classes[node.name] = {
                "name": node.name,
                "doc": c_doc,
                "methods": methods,
                "fields": fields,
                "start_line": node.lineno,
                "end_line": getattr(node, "end_lineno", node.lineno)
            }
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            f_doc = ast.get_docstring(node) or ""
            f_sig = get_node_signature(node)
            functions[node.name] = {
                "name": node.name,
                "signature": f_sig,
                "doc": f_doc,
                "start_line": node.lineno,
                "end_line": getattr(node, "end_lineno", node.lineno)
            }
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    inferred_type = infer_node_type(node.value)
                    variables.append({"name": target.id, "type": inferred_type, "line": node.lineno, "scope": "global"})
        elif isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name):
                inferred_type = ast.unparse(node.annotation) if node.annotation else None
                variables.append({"name": node.target.id, "type": inferred_type, "line": node.lineno, "scope": "global"})

    # Now collect function-local variables
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            collect_func_locals(node, variables, None)
        elif isinstance(node, ast.ClassDef):
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    collect_func_locals(item, variables, node.name)

    return {"classes": classes, "functions": functions, "variables": variables, "imports": imports}

def infer_node_type(val_node):
    if val_node is None:
        return None
    if isinstance(val_node, ast.Call):
        if isinstance(val_node.func, ast.Name):
            return val_node.func.id
        elif isinstance(val_node.func, ast.Attribute):
            return val_node.func.attr
    elif isinstance(val_node, ast.Constant):
        if isinstance(val_node.value, str): return "str"
        if isinstance(val_node.value, bool): return "bool"
        if isinstance(val_node.value, int): return "int"
        if isinstance(val_node.value, float): return "float"
    elif isinstance(val_node, ast.List):
        return "list"
    elif isinstance(val_node, ast.Dict):
        return "dict"
    elif isinstance(val_node, ast.Set):
        return "set"
    elif isinstance(val_node, ast.Tuple):
        return "tuple"
    return None

def collect_func_locals(func_node, variables_out, class_name):
    # Function arguments
    for a in func_node.args.args:
        ann = ast.unparse(a.annotation) if a.annotation else None
        variables_out.append({"name": a.arg, "type": ann, "line": func_node.lineno, "scope": func_node.name, "start": func_node.lineno, "end": getattr(func_node, "end_lineno", func_node.lineno)})
    for stmt in ast.walk(func_node):
        if stmt is func_node: continue
        if isinstance(stmt, ast.Assign):
            for t in stmt.targets:
                if isinstance(t, ast.Name):
                    itype = infer_node_type(stmt.value)
                    variables_out.append({"name": t.id, "type": itype, "line": stmt.lineno, "scope": func_node.name, "start": func_node.lineno, "end": getattr(func_node, "end_lineno", func_node.lineno)})
        elif isinstance(stmt, ast.AnnAssign):
            if isinstance(stmt.target, ast.Name):
                ann = ast.unparse(stmt.annotation) if stmt.annotation else None
                variables_out.append({"name": stmt.target.id, "type": ann, "line": stmt.lineno, "scope": func_node.name, "start": func_node.lineno, "end": getattr(func_node, "end_lineno", func_node.lineno)})

def resolve_runtime_object(path_str, blocked=None):
    if not path_str:
        return None, ""
    parts = [p for p in path_str.split(".") if p]
    if not parts:
        return None, ""
    # Disabled external libraries resolve to nothing even when installed.
    if blocked and parts[0].lower() in blocked:
        return None, ""
    
    # 1. Try importing root
    try:
        obj = importlib.import_module(parts[0])
        for p in parts[1:]:
            obj = getattr(obj, p)
        return obj, path_str
    except Exception:
        pass

    # 2. Try builtins
    if hasattr(builtins, parts[0]):
        try:
            obj = getattr(builtins, parts[0])
            for p in parts[1:]:
                obj = getattr(obj, p)
            return obj, path_str
        except Exception:
            pass

    # 3. Try standard library modules
    stdlib_names = getattr(sys, "stdlib_module_names", set())
    if parts[0] in stdlib_names:
        try:
            mod = importlib.import_module(parts[0])
            obj = mod
            for p in parts[1:]:
                obj = getattr(obj, p)
            return obj, path_str
        except Exception:
            pass

    return None, ""

def _external_lib_sets(req):
    # Unknown third-party packages are never blocked.
    blocked = set()
    enabled_imports = []
    enabled_ids = set(str(x).lower() for x in (req.get("enabledLibIds") or []))
    for entry in (req.get("externalLibs") or []):
        name = str(entry.get("importName") or "").strip().lower()
        if not name:
            continue
        if str(entry.get("id") or "").lower() in enabled_ids:
            enabled_imports.append(name)
        else:
            blocked.add(name)
    return blocked, enabled_imports

def get_runtime_sig_and_doc(obj, name):
    doc = clean_doc(inspect.getdoc(obj))
    sig = ""
    try:
        sig = f"{name}{inspect.signature(obj)}"
    except Exception:
        pass
    if not sig:
        try:
            rendered = pydoc.render_doc(obj)
            clean = re.sub(r'.\\x08', '', rendered)
            for line in clean.split('\\n'):
                line = line.strip()
                if '(' in line and line.startswith(name + '('):
                    paren_end = line.rfind(')')
                    if paren_end != -1:
                        sig = line[:paren_end + 1]
                        break
        except Exception:
            pass
    if not sig:
        if inspect.isclass(obj):
            sig = f"class {name}"
        elif inspect.ismodule(obj):
            sig = f"module {name}"
        else:
            first_line = doc.split('\\n')[0] if doc else ""
            sig = first_line if ('(' in first_line) else name
    return sig, doc

def do_completions(req):
    code = req.get("fileContent", "")
    line = req.get("cursorLine", 1)
    context = (req.get("context") or "").strip()
    is_dot = req.get("isDot", False)
    is_annotation = req.get("isAnnotation", False)
    project_files = req.get("projectFiles") or []
    blocked, enabled_imports = _external_lib_sets(req)

    # Parse active file
    parsed = parse_code(code, line)
    
    # Parse project files for classes and functions
    all_classes = dict(parsed["classes"])
    all_functions = dict(parsed["functions"])
    for pf in project_files:
        p_parsed = parse_code(pf.get("content", ""))
        for k, v in p_parsed["classes"].items():
            if k not in all_classes:
                all_classes[k] = v
        for k, v in p_parsed["functions"].items():
            if k not in all_functions:
                all_functions[k] = v

    items = []
    seen = set()

    def add_item(name, kind, detail="", doc="", signature="", insert_text="", sort_text="5"):
        if name in seen or not name or name.startswith("__") and name not in ("__init__", "__str__", "__repr__", "__len__"):
            return
        seen.add(name)
        items.append({
            "name": name,
            "kind": kind,
            "detail": detail or signature or name,
            "doc": doc,
            "signature": signature,
            "insertText": insert_text or name,
            "sortText": f"{sort_text}_{name}"
        })

    # CASE 1: Member Access (e.g. expr.)
    if is_dot and context:
        target_class_name = None

        # Check if context is "self"
        if context == "self":
            for cname, cinfo in parsed["classes"].items():
                if cinfo["start_line"] <= line <= cinfo["end_line"]:
                    target_class_name = cname
                    break

        if not target_class_name:
            for cname, cinfo in parsed["classes"].items():
                if cinfo["start_line"] <= line <= cinfo["end_line"]:
                    clean_ctx = context.replace("self.", "")
                    if clean_ctx in cinfo["fields"]:
                        fld = cinfo["fields"][clean_ctx]
                        target_class_name = fld.get("type")
                        break

        # Check in-scope local variables
        if not target_class_name:
            for var in parsed["variables"]:
                if var["name"] == context:
                    v_scope = var.get("scope")
                    v_start = var.get("start", 1)
                    v_end = var.get("end", 999999)
                    if (v_scope == "global") or (v_start <= line <= v_end and var["line"] <= line):
                        target_class_name = var.get("type")
                        break

        # Check if context itself is a known project class
        if not target_class_name and context in all_classes:
            target_class_name = context

        # Case-insensitive class-name fallback
        if not target_class_name:
            norm_ctx = context.replace("self.", "").replace("_", "").lower()
            for cname in all_classes:
                if cname.lower() == norm_ctx or cname.replace("_", "").lower() == norm_ctx:
                    target_class_name = cname
                    break

        # If resolved to a user class in project:
        if target_class_name and target_class_name in all_classes:
            cls_info = all_classes[target_class_name]
            for mname, minfo in cls_info["methods"].items():
                add_item(mname, "Method", detail=minfo["signature"], doc=minfo["doc"], signature=minfo["signature"], sort_text="0")
            for fname, finfo in cls_info["fields"].items():
                add_item(fname, "Field", detail=finfo.get("detail", "field"), doc=finfo.get("doc", ""), sort_text="1")
            return {"items": items}

        # Check if context is an imported alias
        resolved_context = parsed["imports"].get(context, context)

        # Resolve in Python runtime (standard library, builtins, or enabled external library)
        obj, fqn = resolve_runtime_object(resolved_context, blocked)
        if obj is None and target_class_name:
            obj, fqn = resolve_runtime_object(target_class_name, blocked)

        if obj is not None:
            for attr in dir(obj):
                if attr.startswith("_") and attr not in ("__init__", "__str__", "__len__"):
                    continue
                try:
                    val = getattr(obj, attr)
                    kind = "Method" if inspect.isroutine(val) else ("Class" if inspect.isclass(val) else "Property")
                    sig, doc = get_runtime_sig_and_doc(val, attr)
                    add_item(attr, kind, detail=sig or attr, doc=doc, signature=sig, sort_text="0")
                except Exception:
                    add_item(attr, "Property", sort_text="1")
            return {"items": items}

        # Fallback for unknown object: suggest methods of common types if nothing resolved
        return {"items": []}

    # CASE 2: Decorator completion (@)
    if is_annotation:
        # 1. Built-in descriptor decorators (property, classmethod, staticmethod)
        for b_name in ("property", "classmethod", "staticmethod"):
            val = getattr(builtins, b_name, None)
            if val:
                sig, doc = get_runtime_sig_and_doc(val, b_name)
                add_item(b_name, "Function", detail=f"built-in {b_name}", doc=doc, signature=sig, sort_text="0_0")

        # 2. Dynamically inspect standard decorator modules without hardcoded item lists
        for mod_name in ("functools", "dataclasses", "abc"):
            try:
                mod = importlib.import_module(mod_name)
                for attr in dir(mod):
                    if attr.startswith("_"):
                        continue
                    val = getattr(mod, attr, None)
                    if callable(val):
                        doc = clean_doc(inspect.getdoc(val))
                        sig, _ = get_runtime_sig_and_doc(val, attr)
                        kind = "Class" if inspect.isclass(val) else "Function"
                        add_item(attr, kind, detail=f"{mod_name}.{attr}", doc=doc, signature=sig, sort_text="0_1")
            except Exception:
                pass

        # 3. User defined functions and classes in project
        for fname, finfo in all_functions.items():
            add_item(fname, "Function", detail=finfo["signature"], doc=finfo["doc"], signature=finfo["signature"], sort_text="1")

        for cname, cinfo in all_classes.items():
            add_item(cname, "Class", detail=f"class {cname}", doc=cinfo["doc"], sort_text="2")

        return {"items": items}

    # CASE 3: Top-level completions (variables, classes, functions, imports, builtins, stdlib, keywords)
    # 1. Local variables and parameters in scope
    for var in parsed["variables"]:
        v_scope = var.get("scope")
        v_start = var.get("start", 1)
        v_end = var.get("end", 999999)
        if (v_scope == "global") or (v_start <= line <= v_end and var["line"] <= line):
            v_type = f": {var['type']}" if var.get("type") else ""
            add_item(var["name"], "Variable", detail=f"variable{v_type}", sort_text="0")

    # 2. Classes in active file and project
    for cname, cinfo in all_classes.items():
        add_item(cname, "Class", detail=f"class {cname}", doc=cinfo["doc"], sort_text="1")

    # 3. Functions in active file and project
    for fname, finfo in all_functions.items():
        add_item(fname, "Function", detail=finfo["signature"], doc=finfo["doc"], signature=finfo["signature"], sort_text="2")

    # 4. Imported aliases
    for alias, fqn in parsed["imports"].items():
        add_item(alias, "Module", detail=f"import {fqn}", sort_text="3")

    # 5. Builtins (functions and types)
    for name in dir(builtins):
        if name.startswith("_"):
            continue
        val = getattr(builtins, name, None)
        if val is None:
            continue
        kind = "Class" if inspect.isclass(val) else ("Function" if inspect.isroutine(val) else "Property")
        sig, doc = get_runtime_sig_and_doc(val, name)
        add_item(name, kind, detail=sig or f"built-in {name}", doc=doc, signature=sig, sort_text="5")

    # 6. Standard library modules
    stdlib_names = getattr(sys, "stdlib_module_names", set())
    for mod in sorted(stdlib_names):
        if not mod.startswith("_"):
            add_item(mod, "Module", detail=f"module {mod}", doc=f"Python standard library module \`{mod}\`", sort_text="6")

    # 7. Enabled external libraries
    for lib_name in enabled_imports:
        try:
            mod = importlib.import_module(lib_name)
            doc = clean_doc(inspect.getdoc(mod))
            add_item(lib_name, "Module", detail=f"external library {lib_name}", doc=doc, sort_text="4")
        except Exception:
            pass

    # 8. Keywords
    py_keywords = [
        "def", "class", "return", "if", "else", "elif", "for", "while", "try", "except",
        "finally", "import", "from", "with", "as", "async", "await", "yield", "lambda",
        "pass", "break", "continue", "raise", "in", "is", "and", "or", "not", "None",
        "True", "False", "global", "nonlocal", "assert", "del"
    ]
    for kw in py_keywords:
        add_item(kw, "Keyword", detail="keyword", sort_text="8")

    return {"items": items}

def do_hover(req):
    symbol = req.get("symbol", "")
    context = (req.get("context") or "").strip()
    code = req.get("fileContent", "")
    line = req.get("cursorLine", 1)
    project_files = req.get("projectFiles") or []
    blocked, _ = _external_lib_sets(req)

    if not symbol:
        return None

    # 1. Check user AST
    parsed = parse_code(code, line)
    all_classes = dict(parsed["classes"])
    all_functions = dict(parsed["functions"])
    for pf in project_files:
        p_parsed = parse_code(pf.get("content", ""))
        for k, v in p_parsed["classes"].items():
            if k not in all_classes: all_classes[k] = v
        for k, v in p_parsed["functions"].items():
            if k not in all_functions: all_functions[k] = v

    # Check member access on user class (context.symbol)
    if context:
        # If context is a variable in scope, infer its type
        target_class = context
        if context == "self":
            for cname, cinfo in parsed["classes"].items():
                if cinfo["start_line"] <= line <= cinfo["end_line"]:
                    target_class = cname
                    break
        else:
            for var in parsed["variables"]:
                if var["name"] == context and var.get("type"):
                    target_class = var["type"]
                    break

        if target_class in all_classes:
            cls_info = all_classes[target_class]
            if symbol in cls_info["methods"]:
                m = cls_info["methods"][symbol]
                return {
                    "signature": m["signature"],
                    "doc": m["doc"] or f"Method of \`{target_class}\`",
                    "detail": f"{target_class}.{symbol}",
                    "moduleOrClass": target_class
                }
            if symbol in cls_info["fields"]:
                f = cls_info["fields"][symbol]
                return {
                    "signature": f"{symbol}: {f.get('detail', 'Any')}",
                    "doc": f.get("doc", f"Field of \`{target_class}\`"),
                    "detail": f"{target_class}.{symbol}",
                    "moduleOrClass": target_class
                }

    # Check if symbol is a user function
    if not context and symbol in all_functions:
        fn = all_functions[symbol]
        return {
            "signature": fn["signature"],
            "doc": fn["doc"] or f"Function \`{symbol}\`",
            "detail": fn["name"],
            "moduleOrClass": ""
        }

    # Check if symbol is a user class
    if not context and symbol in all_classes:
        cls_info = all_classes[symbol]
        return {
            "signature": f"class {symbol}",
            "doc": cls_info["doc"] or f"Class \`{symbol}\`",
            "detail": symbol,
            "moduleOrClass": symbol
        }

    # 2. Runtime reflection
    full_path = f"{context}.{symbol}" if context else symbol
    # Check import aliases
    if context in parsed["imports"]:
        full_path = f"{parsed['imports'][context]}.{symbol}"
    elif not context and symbol in parsed["imports"]:
        full_path = parsed["imports"][symbol]

    obj, resolved_name = resolve_runtime_object(full_path, blocked)
    if obj is not None:
        sig, doc = get_runtime_sig_and_doc(obj, symbol)
        return {
            "signature": sig,
            "doc": doc,
            "detail": resolved_name,
            "moduleOrClass": resolved_name.rsplit(".", 1)[0] if "." in resolved_name else ""
        }

    return None

def do_signature_help(req):
    func_name = req.get("funcName", "")
    context = (req.get("context") or "").strip()
    code = req.get("fileContent", "")
    project_files = req.get("projectFiles") or []
    blocked, _ = _external_lib_sets(req)

    if not func_name:
        return None

    # Check user AST functions
    parsed = parse_code(code)
    for pf in project_files:
        p_parsed = parse_code(pf.get("content", ""))
        for k, v in p_parsed["functions"].items():
            if k not in parsed["functions"]: parsed["functions"][k] = v
        for k, v in p_parsed["classes"].items():
            if k not in parsed["classes"]: parsed["classes"][k] = v

    if func_name in parsed["functions"]:
        fn = parsed["functions"][func_name]
        sig = fn["signature"]
        params = parse_params_from_sig(sig)
        return {"signature": sig, "doc": fn["doc"], "parameters": params}

    # Check class methods
    target_class = None
    if context:
        for var in parsed["variables"]:
            if var["name"] == context and var.get("type"):
                target_class = var["type"]
                break
        if not target_class and context in parsed["classes"]:
            target_class = context

    if target_class and target_class in parsed["classes"]:
        cls = parsed["classes"][target_class]
        if func_name in cls["methods"]:
            fn = cls["methods"][func_name]
            sig = fn["signature"]
            params = parse_params_from_sig(sig)
            return {"signature": sig, "doc": fn["doc"], "parameters": params}

    for cls in parsed["classes"].values():
        if func_name in cls["methods"]:
            fn = cls["methods"][func_name]
            sig = fn["signature"]
            params = parse_params_from_sig(sig)
            return {"signature": sig, "doc": fn["doc"], "parameters": params}

    # Check runtime
    full_path = f"{context}.{func_name}" if context else func_name
    obj, _ = resolve_runtime_object(full_path, blocked)
    if obj is not None:
        sig, doc = get_runtime_sig_and_doc(obj, func_name)
        params = parse_params_from_sig(sig)
        return {"signature": sig, "doc": doc, "parameters": params}

    return None

def parse_params_from_sig(sig):
    if not sig: return []
    open_p = sig.find("(")
    close_p = sig.rfind(")")
    if open_p == -1 or close_p == -1 or close_p <= open_p + 1:
        return []
    raw = sig[open_p + 1:close_p]
    out = []
    for part in raw.split(","):
        p = part.strip()
        if p and p not in ("/", "*"):
            out.append({"label": p})
    return out

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
        rid = req.get("id", 0)
        action = req.get("action")
        payload = req.get("payload", {})
        if action == "completions":
            res = do_completions(payload)
        elif action == "hover":
            res = do_hover(payload)
        elif action == "signature_help":
            res = do_signature_help(payload)
        else:
            res = None
        sys.stdout.write(json.dumps({"id": rid, "result": res}) + "\\n")
    except Exception as e:
        sys.stdout.write(json.dumps({"id": req.get("id", 0) if "req" in dir() else 0, "result": None, "error": str(e)}) + "\\n")
    sys.stdout.flush()
`;

  private getPythonCmd(): string {
    return resolvePythonBinary(storage.getSettings().pythonPath);
  }

  private ensureDaemon(): void {
    const cmd = this.getPythonCmd();
    if (this.proc && !this.proc.killed && this.lastCmd === cmd) return;
    if (this.startingPromise) return;
    this.lastCmd = cmd;

    this.startingPromise = new Promise<void>((resolve) => {
      try {
        const proc = spawn(cmd, ['-u', '-c', this.daemonScript], {
          stdio: ['pipe', 'pipe', 'ignore'],
        });
        this.proc = proc;
        this.stdoutBuffer = '';

        proc.stdout?.on('data', (chunk: Buffer) => {
          this.stdoutBuffer += chunk.toString('utf-8');
          let nl: number;
          while ((nl = this.stdoutBuffer.indexOf('\n')) !== -1) {
            const line = this.stdoutBuffer.slice(0, nl).trim();
            this.stdoutBuffer = this.stdoutBuffer.slice(nl + 1);
            if (!line) continue;
            try {
              const msg = JSON.parse(line);
              const pending = this.pending.get(msg.id);
              if (pending) {
                clearTimeout(pending.timer);
                this.pending.delete(msg.id);
                pending.resolve(msg.result ?? null);
              }
            } catch {}
          }
        });

        proc.on('exit', () => {
          if (this.proc === proc) {
            this.proc = null;
            this.startingPromise = null;
          }
          for (const [id, p] of this.pending) {
            clearTimeout(p.timer);
            this.pending.delete(id);
            p.resolve(null);
          }
        });

        proc.on('error', () => {
          this.proc = null;
          this.startingPromise = null;
          resolve();
        });

        resolve();
      } catch {
        this.proc = null;
        this.startingPromise = null;
        resolve();
      }
    });
  }

  private callDaemon(action: string, payload: Record<string, unknown>, timeoutMs = 1500): Promise<any> {
    this.ensureDaemon();
    const proc = this.proc;
    if (!proc || !proc.stdin || proc.killed) return Promise.resolve(null);

    const id = ++this.reqId;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      try {
        proc.stdin!.write(JSON.stringify({ id, action, payload }) + '\n');
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(null);
      }
    });
  }

  public async getCompletions(query: IntellisenseCompletionQuery): Promise<IntellisenseCompletionResult> {
    try {
      const res = await this.callDaemon('completions', this.withLibCatalog(query as unknown as Record<string, unknown>), 2000);
      return { items: res?.items || [] };
    } catch {
      return { items: [] };
    }
  }

  public async getHover(query: IntellisenseHoverQuery): Promise<IntellisenseHoverResult | null> {
    try {
      const res = await this.callDaemon('hover', this.withLibCatalog(query as unknown as Record<string, unknown>), 1500);
      return res ?? null;
    } catch {
      return null;
    }
  }

  public async getSignatureHelp(query: IntellisenseSignatureHelpQuery): Promise<IntellisenseSignatureHelpResult | null> {
    try {
      const res = await this.callDaemon('signature_help', this.withLibCatalog(query as unknown as Record<string, unknown>), 1500);
      return res ?? null;
    } catch {
      return null;
    }
  }

  public prewarm(): void {
    this.ensureDaemon();
  }

  public shutdown(): void {
    try {
      this.proc?.kill();
    } catch {}
    this.proc = null;
    this.startingPromise = null;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve(null);
    }
    this.pending.clear();
  }
}

export const pythonEngine = new PythonEngine();
