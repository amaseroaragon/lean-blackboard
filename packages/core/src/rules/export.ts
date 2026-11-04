import { rulesToWire } from '../precise';
import { defaultRules } from './defaultRules';

/** Default rules in the Lean side's JSON format (`LeanBlackboard.Rules`), sorted for stable diffs. */
export function defaultRulesJson(): string {
  const wire = rulesToWire(defaultRules);
  wire.symbols.sort((a, b) => a.name.localeCompare(b.name));
  wire.functions.sort((a, b) => a.name.localeCompare(b.name));
  return `${JSON.stringify(wire, null, 2)}\n`;
}
