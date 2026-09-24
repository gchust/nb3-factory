// A deliberately small JSON Schema (2020-12 subset) validator for the factory's
// own public contracts. Unknown keywords are rejected instead of being ignored,
// so a contract can never promise a rule this validator silently skips.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ANNOTATIONS = new Set(['$schema', '$id', '$comment', 'title', 'description', 'examples', 'default', 'deprecated', 'readOnly', '$defs']);
const KEYWORDS = new Set(['type', 'enum', 'const', 'properties', 'required', 'additionalProperties', 'propertyNames',
  'items', 'minItems', 'maxItems', 'uniqueItems', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern',
  'format', 'oneOf', 'anyOf', 'allOf', '$ref', 'minProperties', 'maxProperties']);
const FORMATS = {
  'date-time': value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value)),
  uri: value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol); } catch { return false; } },
};
const CONTRACTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../contracts');

const typeOf = value => value === null ? 'null' : Array.isArray(value) ? 'array'
  : Number.isInteger(value) ? 'integer' : typeof value;
const matchesType = (value, type) => typeOf(value) === type || (type === 'number' && typeof value === 'number' && Number.isFinite(value));
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

function resolveRef(root, ref) {
  if (!/^#\/\$defs\/[A-Za-z0-9_-]+$/.test(ref)) throw new Error(`Unsupported schema reference ${ref}`);
  const target = root.$defs?.[ref.slice('#/$defs/'.length)];
  if (!target) throw new Error(`Missing schema definition ${ref}`);
  return target;
}

function check(root, schema, value, at, errors) {
  if (schema === true) return;
  if (schema === false) { errors.push(`${at}: not allowed`); return; }
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error(`Invalid schema at ${at}`);
  for (const key of Object.keys(schema)) {
    if (!KEYWORDS.has(key) && !ANNOTATIONS.has(key)) throw new Error(`Unsupported schema keyword ${key} at ${at}`);
  }
  const before = errors.length;
  if (schema.$ref) check(root, resolveRef(root, schema.$ref), value, at, errors);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(type => matchesType(value, type))) { errors.push(`${at}: expected ${types.join('|')}`); return; }
  }
  if (schema.const !== undefined && canonical(schema.const) !== canonical(value)) errors.push(`${at}: must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some(item => canonical(item) === canonical(value))) errors.push(`${at}: must be one of ${schema.enum.map(v => JSON.stringify(v)).join(', ')}`);
  if (typeof value === 'string') {
    const length = Array.from(value).length;
    if (schema.minLength !== undefined && length < schema.minLength) errors.push(`${at}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && length > schema.maxLength) errors.push(`${at}: longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
    if (schema.format) {
      if (!FORMATS[schema.format]) throw new Error(`Unsupported format ${schema.format}`);
      if (!FORMATS[schema.format](value)) errors.push(`${at}: invalid ${schema.format}`);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: more than ${schema.maxItems} items`);
    if (schema.uniqueItems && new Set(value.map(canonical)).size !== value.length) errors.push(`${at}: duplicate items`);
    if (schema.items !== undefined) value.forEach((item, index) => check(root, schema.items, item, `${at}[${index}]`, errors));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push(`${at}: fewer than ${schema.minProperties} properties`);
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) errors.push(`${at}: more than ${schema.maxProperties} properties`);
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) errors.push(`${at}: missing ${key}`);
    for (const key of keys) {
      const child = `${at}.${key}`;
      if (schema.propertyNames) check(root, schema.propertyNames, key, `${child}(name)`, errors);
      if (schema.properties && Object.hasOwn(schema.properties, key)) check(root, schema.properties[key], value[key], child, errors);
      else if (schema.additionalProperties !== undefined) check(root, schema.additionalProperties, value[key], child, errors);
    }
  }
  if (schema.allOf) schema.allOf.forEach(item => check(root, item, value, at, errors));
  for (const [keyword, accept] of [['anyOf', n => n > 0], ['oneOf', n => n === 1]]) {
    if (!schema[keyword]) continue;
    const passing = schema[keyword].filter(item => { const nested = []; check(root, item, value, at, nested); return !nested.length; }).length;
    if (!accept(passing)) errors.push(`${at}: must match ${keyword === 'oneOf' ? 'exactly one' : 'at least one'} alternative (${passing} matched)`);
  }
  if (errors.length - before > 50) errors.splice(before + 50);
}

export function validateSchema(schema, value) {
  const errors = [];
  check(schema, schema, value, '$', errors);
  return errors;
}

export function assertSchema(schema, value, label = 'document') {
  const errors = validateSchema(schema, value);
  if (errors.length) throw new Error(`${label} does not match its contract: ${errors.slice(0, 8).join('; ')}`);
  return value;
}

const cache = new Map();
// Contracts are versioned repository files, never fetched from a receiver at run time.
export function loadContract(name) {
  if (!/^[a-z][a-z0-9-]*\.v[1-9]\d*$/.test(name)) throw new Error('Invalid contract name');
  if (!cache.has(name)) cache.set(name, JSON.parse(readFileSync(path.join(CONTRACTS, `${name}.schema.json`), 'utf8')));
  return cache.get(name);
}
