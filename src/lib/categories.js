const RULES = [
  ["Evidence & settings", /(evidence|unknown|analysis_settings|analysis_view|environment_bundle|reconstruction|verify_|coverage|record_unknown)/],
  ["Android", /(adb|android|apk|apktool|jeb|harmony|dart|flutter)/],
  ["JavaScript & web", /(javascript|web|electron|browser|webmcp|wasm|bundle|source_to_bundle|export_shapes)/],
  ["Apple", /(macho|objc|swift|apple|plist|dylib|keyed_archive|interface_builder|asset_catalog|_ips|signature|architectures|bundle_resources)/],
  [".NET & managed", /managed/],
  ["Windows PE", /(^|_)pe_/],
  ["Dynamic & debugging", /(frida|gdb|rizin|process|observe_native|capture_native|native_ui|cutter)/],
  ["Firmware, network & more", /(firmware|devicetree|kernel|signal|packet|pcap|evm|model_artifact|gpu|beam|sqlite|pyc|il2cpp|go_binary|rust_binary|desktop_application|crash)/],
  ["Archives & files", /(artifact|entropy|elf_notes|objdump|binary_layout|native_exports|compare_)/],
];

export function categoryOf(name) {
  for (const [label, re] of RULES) if (re.test(name)) return label;
  return "Native (disassembler)";
}

export const CATEGORY_ORDER = ["Archives & files", "JavaScript & web", "Native (disassembler)", "Apple", "Android", ".NET & managed", "Windows PE", "Dynamic & debugging", "Firmware, network & more", "Evidence & settings"];

export function hintBadges(annotations = {}) {
  const b = [];
  if (annotations.readOnlyHint) b.push({ key: "ro", label: "read-only", tone: "ok" });
  if (annotations.destructiveHint) b.push({ key: "destructive", label: "changes state", tone: "warn" });
  if (annotations.openWorldHint) b.push({ key: "open", label: "external tools", tone: "info" });
  return b;
}
