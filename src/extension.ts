// The module 'vscode' contains the VS Code extensibility API
// Import the necessary extensibility types to use in your code below
import {
  window,
  Disposable,
  ExtensionContext,
  StatusBarAlignment,
  StatusBarItem,
  TextDocument,
  TextEditor,
  Position,
  WorkspaceEdit,
  workspace,
  TextEdit,
  Range,
  Uri
} from "vscode";

const fs = require("fs");

let timer: any;

let working = false;

// This method is called when your extension is activated. Activation is
// controlled by the activation events defined in package.json.
export function activate(context: ExtensionContext) {
  // create a new word counter
  let fimports = new Fimports();
  let controller = new FimportsController(fimports);

  // Add to a list of disposables which are disposed when this extension is deactivated.
  context.subscriptions.push(controller);
  context.subscriptions.push(fimports);
}

class Fimports {
  private _statusBarItem: StatusBarItem;

  constructor() {
    this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
  }

  public init() {
    // Create as needed
    if (!this._statusBarItem) {
      this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
    }

    // Get the current text editor
    let editor = window.activeTextEditor;
    if (!editor) {
      this._statusBarItem.hide();
      return;
    }

    let doc = editor.document;

    if (
      doc.languageId === "javascript" ||
      doc.languageId === "typescript" ||
      doc.languageId === "javascriptreact" ||
      doc.languageId === "typescriptreact"
    ) {
      this._statusBarItem.show();
      this._statusBarItem.text = !working
        ? "Fimports ✔"
        : "Fimports: working...";
      if (!working) {
        this._work(doc, editor);
      }
    } else {
      this._statusBarItem.hide();
    }
  }

  public _work(doc: TextDocument, editor: any) {
    let docContent = doc.getText();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    timer = setTimeout(() => {
      working = true;
      if (docContent !== "") {
        const lines = docContent.split("\n");
        for (let l of lines) {
          if (~l.indexOf("import ")) {
            if (~l.indexOf("{") && ~l.indexOf("}") && !~l.indexOf("from")) {
              const values = l
                .split("{")[1]
                .split("}")[0]
                .trim()
                .split(" ");
              if (values.length > 0) {
                for (let v of values) {
                  if (v === " " || v === "") {
                    stopWorking();
                    return;
                  }
                  this._search(v)
                    .then(r => {
                      const lin = l;
                      const url = r;
                      if (!~l.indexOf("from")) {
                        applyEdit(
                          editor,
                          {
                            start: {
                              line: lines.indexOf(l),
                              char: ~lin.indexOf(";")
                                ? lin.indexOf(";")
                                : lin.length
                            },
                            end: {
                              line: lines.indexOf(l),
                              char: ~lin.indexOf(";")
                                ? lin.indexOf(";")
                                : lin.length
                            }
                          },
                          ` from "${url.split("\\").join("/")}"${
                            ~lin.indexOf(";") ? "" : ";"
                          }`
                        );
                        stopWorking();
                      } else {
                        stopWorking();
                      }
                      this._statusBarItem.text = "Fimports: Done";
                    })
                    .catch((r: string) => {
                      this._statusBarItem.text = "Fimports: Not found " + r;
                      stopWorking();
                    });
                }
              } else {
                stopWorking();
              }
            } else {
              stopWorking();
            }
          } else {
            stopWorking();
          }
        }
      } else {
        stopWorking();
      }
    }, 1000);
  }

  public _search(value: string): Promise<string> {
    return new Promise((a, r) => {
      working = true;
      const sourceCodeFolder = workspace
        .getConfiguration("fimports")
        .get("sourceCodeFolder");
      workspace
        .findFiles(
          sourceCodeFolder + "/**/*.{js,jsx,ts,tsx}",
          "**/node_modules/**",
          100000
        )
        .then((res: Uri[]) => {
          res.forEach((f: Uri) => {
            this._statusBarItem.text = "Processing " + f.fsPath;
            const data = fs.readFileSync(f.fsPath, "utf8");
            if (~data.indexOf(` ${value} `)) {
              if (
                !~data
                  .split(value)[0]
                  .split("\n")
                  .pop()
                  .indexOf("export")
              ) {
                return;
              }
              let res = f.fsPath;
              if (workspace.workspaceFolders) {
                res = res.split(workspace.workspaceFolders[0].name)[1];
              }
              const aux = res.split(".");
              aux.pop();
              res = aux.join(".");
              a(res);
            }
          });
          r(value);
        });
    });
  }

  dispose() {
    if (this._statusBarItem) this._statusBarItem.dispose();
  }
}

class FimportsController {
  private _wordCounter: Fimports;
  private _disposable: Disposable;

  constructor(wordCounter: Fimports) {
    this._wordCounter = wordCounter;

    // subscribe to selection change and editor activation events
    let subscriptions: Disposable[] = [];
    window.onDidChangeTextEditorSelection(this._onEvent, this, subscriptions);
    window.onDidChangeActiveTextEditor(this._onEvent, this, subscriptions);

    this._wordCounter.init();

    // create a combined disposable from both event subscriptions
    this._disposable = Disposable.from(...subscriptions);
  }

  dispose() {
    this._disposable.dispose();
  }

  private _onEvent() {
    this._wordCounter.init();
  }
}

function stopWorking() {
  setTimeout(() => {
    working = false;
  }, 500);
}

function applyEdit(vsEditor: TextEditor, coords: any, content: any) {
  var vsDocument = getDocument(vsEditor);
  var edit = setEditFactory(vsDocument._uri, coords, content);
  workspace.applyEdit(edit);
}

function textEditFactory(range: any, content: any) {
  return new TextEdit(range, content);
}

function rangeFactory(start: any, end: any) {
  return new Range(start, end);
}

function getDocument(vsEditor: any) {
  return typeof vsEditor._documentData !== "undefined"
    ? vsEditor._documentData
    : vsEditor._document;
}

function setEditFactory(uri: any, coords: any, content: any) {
  var workspaceEdit = new WorkspaceEdit();
  var edit = editFactory(coords, content);

  workspaceEdit.set(uri, [edit]);
  return workspaceEdit;
}

function positionFactory(line: any, char: any) {
  return new Position(line, char);
}

function editFactory(coords: any, content: any) {
  var start = positionFactory(coords.start.line, coords.start.char);
  var end = positionFactory(coords.end.line, coords.end.char);
  var range = rangeFactory(start, end);

  return textEditFactory(range, content);
}
