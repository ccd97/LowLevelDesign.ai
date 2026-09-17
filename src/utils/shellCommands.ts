export function buildPythonRunCommand(targetFile: string, pythonPath?: string): string {
  const py = pythonPath?.trim() ? `"${pythonPath.trim()}"` : 'python3';
  return `${py} ${targetFile}`;
}

export function buildPythonTestCommand(pythonPath?: string): string {
  const py = pythonPath?.trim() ? `"${pythonPath.trim()}"` : 'python3';
  return `${py} -m unittest discover -s . -p "*test*.py" -v`;
}

export function buildJavaRunCommand(mainClass: string, runtimeCp: string, libsPart?: string): string {
  const compileCp = libsPart ? ` -cp "${libsPart}" -processorpath "${libsPart}"` : '';
  return `javac${compileCp} -d classes $(find . -name "*.java") && java -ea -cp "${runtimeCp}" ${mainClass}`;
}

export function buildJavaTestCommand(testClasses: string[], runtimeCp: string, libsPart?: string): string {
  const compileCp = libsPart ? ` -cp "${libsPart}" -processorpath "${libsPart}"` : '';
  const runs = testClasses.map((c) => `java -ea -cp "${runtimeCp}" ${c}`).join('; ');
  return `javac${compileCp} -d classes $(find . -name "*.java") && ${runs}`;
}
