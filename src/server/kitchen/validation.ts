// Validate the portable schema descriptors at the HTTP and SQLite boundaries.
export type Shape = { type: string; value?: any; tableName?: string };
export function validate(shape: Shape, value: unknown, path = 'value'): void {
  const fail = (): never => { throw new Error(`Invalid ${path}`); };
  switch (shape.type) {
    case 'any': return;
    case 'null': if (value !== null) fail(); return;
    case 'string': if (typeof value !== 'string' || value.length > 750000) fail(); return;
    case 'number': if (typeof value !== 'number' || !Number.isFinite(value)) fail(); return;
    case 'boolean': if (typeof value !== 'boolean') fail(); return;
    case 'id': if (typeof value !== 'string' || !value || value.length > 150 || !/^[a-zA-Z0-9_-]+$/.test(value) || (shape.tableName !== '_storage' && !value.startsWith(`${shape.tableName}_`))) fail(); return;
    case 'literal': if (value !== shape.value) fail(); return;
    case 'array': if (!Array.isArray(value) || value.length > 10000) fail(); for (const item of value as unknown[]) validate(shape.value, item, path); return;
    case 'union': for (const child of shape.value) { try { validate(child, value, path); return; } catch {} } fail(); return;
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
      const object = value as Record<string, unknown>;
      for (const key of Object.keys(object)) if (!Object.hasOwn(shape.value, key)) fail();
      for (const [key, spec] of Object.entries(shape.value) as [string, {optional: boolean; fieldType: Shape}][]) {
        if (object[key] === undefined && spec.optional) continue;
        validate(spec.fieldType, object[key], `${path}.${key}`);
      }
      return;
    }
    default: throw new Error(`Unsupported schema type: ${shape.type}`);
  }
}

export function descriptor(validator: unknown): Shape { return (validator as {json:Shape}).json; }
