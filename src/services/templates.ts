import { FileItem, Language } from '../types/session';

export function getGenericStarterFiles(language: Language, problemTitle: string): FileItem[] {
  const safeName = problemTitle.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  
  if (language === 'python') {
    return [
      {
        path: `${safeName}.py`,
        content: `"""
Problem: ${problemTitle}
Implementation file.
"""

class Solution:
    def __init__(self):
        pass

    def execute(self):
        print("Hello from ${problemTitle}!")
        return True

if __name__ == "__main__":
    app = Solution()
    app.execute()
`,
      },
      {
        path: `test_${safeName}.py`,
        content: `import unittest
from ${safeName} import Solution

class TestSolution(unittest.TestCase):
    def setUp(self):
        self.solution = Solution()

    def test_initial_state(self):
        self.assertTrue(self.solution.execute())

if __name__ == "__main__":
    unittest.main()
`,
      },
    ];
  } else {
    return [
      {
        path: 'src/Solution.java',
        content: `public class Solution {
    public Solution() {
    }

    public boolean execute() {
        System.out.println("Running ${problemTitle}...");
        return true;
    }
}
`,
      },
      {
        path: 'src/SolutionTest.java',
        content: `public class SolutionTest {
    public static void main(String[] args) {
        System.out.println("Running verification tests for ${problemTitle}...");
        Solution s = new Solution();
        boolean result = s.execute();
        assert result : "execute() should return true";
        System.out.println("All Tests Passed Successfully!");
    }
}
`,
      },
    ];
  }
}

export function getBlankStarterFiles(language: Language): FileItem[] {
  if (language === 'python') {
    return [
      {
        path: 'solution.py',
        content: '# Write your Low-Level Design implementation here\n',
      },
    ];
  } else {
    return [
      {
        path: 'src/Solution.java',
        content: 'public class Solution {\n    // Design and implement your classes here\n}\n',
      },
    ];
  }
}
