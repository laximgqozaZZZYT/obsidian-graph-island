// Minimal mock of the obsidian module for unit tests.
// Only stubs used by metadata-parser.ts are needed.

export class TFile {
  path = "";
  basename = "";
  extension = "md";
}

export class App {
  vault = {
    getAbstractFileByPath: () => null,
  };
  metadataCache = {
    getFileCache: () => null,
  };
}
