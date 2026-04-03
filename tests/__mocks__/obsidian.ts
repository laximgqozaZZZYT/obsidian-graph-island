// Minimal mock of the obsidian module for unit tests.
// Only stubs used by metadata-parser.ts are needed.

export class TFile {
  path = "";
  basename = "";
  extension = "md";
}

export class Component {}

export class ItemView extends Component {
  containerEl = { empty: () => {}, createEl: () => ({}) } as any;
  getViewType() { return ""; }
  getDisplayText() { return ""; }
}

export class WorkspaceLeaf {}

export class App {
  vault = {
    getAbstractFileByPath: () => null,
    cachedRead: async () => "",
  };
  metadataCache = {
    getFileCache: () => null,
    resolvedLinks: {},
  };
  workspace = {
    trigger: () => {},
    on: () => ({ id: "" }),
    openLinkText: async () => {},
  };
}

export function setIcon(_el: any, _icon: string) {}

export const MarkdownRenderer = {
  render: async () => {},
};

export class Menu {
  addItem() { return this; }
  addSeparator() { return this; }
  showAtPosition() {}
}

export const Platform = {
  isMobile: false,
};
