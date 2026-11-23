/**
 * Lightweight mock of the VS Code API for Vitest unit tests.
 */

export const SymbolKind = {
  File: 0,
  Module: 1,
  Namespace: 2,
  Package: 3,
  Class: 4,
  Method: 5,
  Property: 6,
  Field: 7,
  Constructor: 8,
  Enum: 9,
  Interface: 10,
  Function: 11,
  Variable: 12,
  Constant: 13,
  String: 14,
  Number: 15,
  Boolean: 16,
  Array: 17,
  Object: 18,
  Key: 19,
  Null: 20,
  EnumMember: 21,
  Struct: 22,
  Event: 23,
  Operator: 24,
  TypeParameter: 25,
};

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

export const TextEditorRevealType = {
  Default: 0,
  InCenter: 1,
  InCenterIfOutsideViewport: 2,
  AtTop: 3,
};

export class Uri {
  public scheme: string;
  public authority: string;
  public path: string;
  public query: string;
  public fragment: string;
  public fsPath: string;

  constructor(fsPath: string) {
    this.fsPath = fsPath;
    this.path = fsPath.replace(/\\/g, '/');
    this.scheme = 'file';
    this.authority = '';
    this.query = '';
    this.fragment = '';
  }

  public static file(path: string): Uri {
    return new Uri(path);
  }

  public static parse(value: string): Uri {
    const uri = new Uri(value);
    uri.scheme = value.startsWith('https:') ? 'https' : 'file';
    return uri;
  }

  public static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    const joined = [base.fsPath, ...pathSegments].join('/');
    return new Uri(joined);
  }

  public toString(): string {
    return this.fsPath;
  }
}

export class Range {
  constructor(
    public startLine: number,
    public startCharacter: number,
    public endLine: number,
    public endCharacter: number
  ) {}
}

export const workspace = {
  workspaceFolders: [
    {
      uri: Uri.file(process.cwd()),
      name: 'CodeNibbl',
      index: 0,
    },
  ],
  findFiles: async () => [],
  openTextDocument: async () => ({
    getText: () => '',
    lineCount: 10,
    lineAt: () => ({ text: '' }),
  }),
  getConfiguration: () => ({
    get: (key: string, defaultValue: any) => defaultValue,
    update: async () => {},
  }),
  onDidSaveTextDocument: () => ({ dispose: () => {} }),
};

export const window = {
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  showQuickPick: async () => undefined,
  showInputBox: async () => undefined,
  registerWebviewViewProvider: () => ({ dispose: () => {} }),
  createStatusBarItem: () => ({
    show: () => {},
    hide: () => {},
    dispose: () => {},
    text: '',
    tooltip: '',
    command: '',
  }),
  showTextDocument: async () => ({
    revealRange: () => {},
  }),
  onDidStartTerminalShellExecution: () => ({ dispose: () => {} }),
  onDidEndTerminalShellExecution: () => ({ dispose: () => {} }),
  withProgress: async (_options: any, task: (progress: any) => Promise<any>) =>
    task({ report: () => {} }),
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: async () => undefined,
};

export const env = {
  openExternal: async () => true,
  clipboard: {
    writeText: async () => {},
    readText: async () => '',
  },
};

export const lm = {
  selectChatModels: async () => [],
};
