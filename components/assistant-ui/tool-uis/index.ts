// Barrel re-export — keeps existing imports from "@/components/assistant-ui/tool-uis" working
export {
  ToolUICallbacksProvider,
  useToolUICallbacks,
  extractToolSources,
  SourceChips,
  type SourceData,
  type ToolUICallbacks,
} from "./tool-ui-shared";
