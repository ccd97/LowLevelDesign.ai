import { FileItem, Language } from '../types/session';

export interface TreeNode {
  name: string;
  path: string; // full relative path, e.g. "src/models/Car.java"
  isDirectory: boolean;
  children?: TreeNode[];
}

export function buildFileTree(files: FileItem[]): TreeNode[] {
  const root: { [key: string]: any } = {};

  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      if (!current[part]) {
        current[part] = {
          __node: {
            name: part,
            path: currentPath,
            isDirectory: isLast ? Boolean(f.isDirectory) : true,
            children: [],
          },
          __children: {},
        };
      }
      current = current[part].__children;
    }
  }

  function convert(obj: any): TreeNode[] {
    const nodes: TreeNode[] = [];
    for (const key of Object.keys(obj)) {
      const entry = obj[key];
      const node: TreeNode = entry.__node;
      const childNodes = convert(entry.__children);
      if (childNodes.length > 0) {
        node.children = childNodes;
      }
      nodes.push(node);
    }
    // Sort: directories first, then alphabetical
    return nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  return convert(root);
}

export function getFileLanguage(filePath: string): 'python' | 'java' | 'json' | 'markdown' | 'plaintext' {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'py':
      return 'python';
    case 'java':
      return 'java';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    default:
      return 'plaintext';
  }
}

export function isJavaTestPath(filePath: string): boolean {
  return /test.*\.java$/i.test(filePath) || /.*test\.java$/i.test(filePath);
}

export function isPythonTestPath(filePath: string): boolean {
  return filePath.toLowerCase().includes('test') && filePath.endsWith('.py');
}

export function isTestFilePath(filePath: string, language?: Language): boolean {
  if (language === 'python') return isPythonTestPath(filePath);
  if (language === 'java') return isJavaTestPath(filePath);
  return isPythonTestPath(filePath) || isJavaTestPath(filePath);
}

export function renameFileInTree(files: FileItem[], oldPath: string, newPath: string): FileItem[] {
  return files.map((f) => {
    if (f.path === oldPath) {
      return { ...f, path: newPath };
    }
    if (f.path.startsWith(`${oldPath}/`)) {
      return { ...f, path: `${newPath}${f.path.substring(oldPath.length)}` };
    }
    return f;
  });
}

export function renameTabsInTree(tabs: string[], oldPath: string, newPath: string): string[] {
  return tabs.map((p) => {
    if (p === oldPath) return newPath;
    if (p.startsWith(`${oldPath}/`)) return `${newPath}${p.substring(oldPath.length)}`;
    return p;
  });
}

export function renameActivePath(active: string | undefined, oldPath: string, newPath: string): string | undefined {
  if (active === oldPath) {
    return newPath;
  }
  if (active && active.startsWith(`${oldPath}/`)) {
    return `${newPath}${active.substring(oldPath.length)}`;
  }
  return active;
}

export function deleteFromTree(files: FileItem[], targetPath: string): FileItem[] {
  return files.filter((f) => f.path !== targetPath && !f.path.startsWith(`${targetPath}/`));
}

export function deleteTabsFromTree(tabs: string[], targetPath: string): string[] {
  return tabs.filter((p) => p !== targetPath && !p.startsWith(`${targetPath}/`));
}

export function hasProjectFilesChanged(currentFiles: FileItem[], diskFiles: FileItem[]): boolean {
  const diskPaths = new Set(diskFiles.map((f) => f.path));
  const currentPaths = new Set(currentFiles.map((f) => f.path));
  if (diskPaths.size !== currentPaths.size) return true;
  for (const f of diskFiles) {
    const match = currentFiles.find((cf) => cf.path === f.path);
    if (!match || match.content !== f.content || Boolean(match.isDirectory) !== Boolean(f.isDirectory)) {
      return true;
    }
  }
  return false;
}

