// Validates user KaTeX macros (`leanBlackboard.macros`): `{ "\\R": "\\mathbb{R}" }`.

export interface MacrosResult {
  macros: Record<string, string>;
  warnings: string[];
}

export function sanitizeMacros(input: unknown): MacrosResult {
  const macros: Record<string, string> = {};
  const warnings: string[] = [];
  if (input === undefined || input === null) return { macros, warnings };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { macros, warnings: ['macros must be an object; ignored.'] };
  }
  for (const [name, body] of Object.entries(input)) {
    if (!/^\\[A-Za-z]+$/.test(name)) {
      warnings.push(`macros["${name}"]: name must be a control sequence such as \\R; ignored.`);
    } else if (typeof body !== 'string') {
      warnings.push(`macros["${name}"]: definition must be a string; ignored.`);
    } else {
      macros[name] = body;
    }
  }
  return { macros, warnings };
}
