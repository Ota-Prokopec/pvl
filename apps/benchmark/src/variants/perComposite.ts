// V2 of the benchmark: the Schemas of `src/schemas/benchmark.ts`, hand-split from
// the inline-everything V1 `pvl compile` emits (ADR-0023) the way ADR-0017
// delegated. Primitive checks stay inline in their object, and every nested
// object or array is a child the parent holds as a property and calls. A child
// pushes into its parent's `issues` and returns its output, and builds its path
// only where V1 does, so the split is the only difference from V1. A Schema
// reused through one `const` is one child, called from each place.
import { pvl } from '@pvl/schema';
import type { Issue, Result, StandardSchemaProps } from '@pvl/schema';
import type {
  ComplexInput,
  ComplexOutput,
  FlatInput,
  FlatOutput,
  HugeInput,
  HugeOutput,
  ListInput,
  ListOutput,
  NestedInput,
  NestedOutput,
  ReusedInput,
  ReusedOutput,
  WideInput,
  WideOutput,
} from '../../.pvl/schemas/benchmark.js';

type Path = ReadonlyArray<PropertyKey>;

export const flat = new (class {
  readonly _standalone: boolean = false;
  readonly shape = {};

  get '~standard'(): StandardSchemaProps<FlatInput, FlatOutput> {
    return {
      version: 1,
      vendor: '@pvl/schema',
      types: undefined,
      validate: (value: unknown): Result<FlatOutput> => this.validate(value),
    };
  }

  validate(value: unknown): Result<FlatOutput> {
    return this._validate(value, []) as Result<FlatOutput>;
  }

  _validate(value: unknown, path: Path): Result<unknown> {
    const issues: Issue[] = [];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected object',
        path: path.length > 0 ? path : undefined,
      });
    } else {
      const input = value as Record<string, unknown>;

      const id = input['id'];
      if (typeof id !== 'number' || Number.isNaN(id)) {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'id'] });
      } else {
        if (!Number.isInteger(id)) {
          issues.push({
            code: 'NOT_INTEGER',
            message: 'Number must be an integer',
            path: [...path, 'id'],
          });
        }
        if (id < 1) {
          issues.push({
            code: 'TOO_SMALL',
            message: 'Number must be greater than or equal to 1',
            path: [...path, 'id'],
          });
        }
      }

      const name = input['name'];
      if (typeof name !== 'string') {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'name'] });
      } else {
        if (name.length < 1) {
          issues.push({
            code: 'TOO_SMALL',
            message: 'String must contain at least 1 character(s)',
            path: [...path, 'name'],
          });
        }
        if (name.length > 64) {
          issues.push({
            code: 'TOO_BIG',
            message: 'String must contain at most 64 character(s)',
            path: [...path, 'name'],
          });
        }
      }

      const email = input['email'];
      if (typeof email !== 'string') {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'email'] });
      } else if (email.length < 3) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'String must contain at least 3 character(s)',
          path: [...path, 'email'],
        });
      }

      const age = input['age'];
      if (typeof age !== 'number' || Number.isNaN(age)) {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'age'] });
      } else {
        if (!Number.isInteger(age)) {
          issues.push({
            code: 'NOT_INTEGER',
            message: 'Number must be an integer',
            path: [...path, 'age'],
          });
        }
        if (age < 0) {
          issues.push({
            code: 'TOO_SMALL',
            message: 'Number must be greater than or equal to 0',
            path: [...path, 'age'],
          });
        }
        if (age > 150) {
          issues.push({
            code: 'TOO_BIG',
            message: 'Number must be less than or equal to 150',
            path: [...path, 'age'],
          });
        }
      }

      const active = input['active'];
      if (typeof active !== 'boolean') {
        issues.push({
          code: 'INVALID_TYPE',
          message: 'Expected boolean',
          path: [...path, 'active'],
        });
      }

      const role = input['role'];
      if (role !== 'admin' && role !== 'editor' && role !== 'viewer') {
        issues.push({
          code: 'INVALID_VALUE',
          message: 'Expected one of "admin", "editor", "viewer"',
          path: [...path, 'role'],
        });
      }

      const kind = input['kind'];
      if (!Object.is(kind, 'user')) {
        issues.push({ code: 'INVALID_VALUE', message: 'Expected "user"', path: [...path, 'kind'] });
      }

      const nickname = input['nickname'];
      if (nickname !== undefined && typeof nickname !== 'string') {
        issues.push({
          code: 'INVALID_TYPE',
          message: 'Expected string',
          path: [...path, 'nickname'],
        });
      }

      const score = input['score'];
      if (score !== null && (typeof score !== 'number' || Number.isNaN(score))) {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'score'] });
      }

      const code = input['code'];
      if (typeof code !== 'string') {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'code'] });
      } else if (code.length !== 6) {
        issues.push({
          code: 'INVALID_LENGTH',
          message: 'String must contain exactly 6 character(s)',
          path: [...path, 'code'],
        });
      }

      const output: Record<string, unknown> = {};
      output['id'] = id;
      output['name'] = name;
      output['email'] = email;
      output['age'] = age;
      output['active'] = active;
      output['role'] = role;
      output['kind'] = kind;
      if (nickname !== undefined || Object.hasOwn(input, 'nickname')) {
        output['nickname'] = nickname;
      }
      output['score'] = score;
      output['code'] = code;
      value = output;
    }
    return issues.length > 0 ? { issues } : { value };
  }

  standalone(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this) as object) as this, this, {
      _standalone: true,
    });
  }
})();

const nestedLevel5 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const name = input['name'];
    if (typeof name !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'name'] });
    }

    const level = input['level'];
    if (typeof level !== 'number' || Number.isNaN(level)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'level'] });
    } else if (!Number.isInteger(level)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...path, 'level'],
      });
    }

    const output: Record<string, unknown> = {};
    output['name'] = name;
    output['level'] = level;
    return output;
  },
};

const nestedLevel4 = {
  child: nestedLevel5,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const name = input['name'];
    if (typeof name !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'name'] });
    }

    const level = input['level'];
    if (typeof level !== 'number' || Number.isNaN(level)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'level'] });
    } else if (!Number.isInteger(level)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...path, 'level'],
      });
    }

    const child = this.child._check(input['child'], path, 'child', issues);

    const output: Record<string, unknown> = {};
    output['name'] = name;
    output['level'] = level;
    output['child'] = child;
    return output;
  },
};

const nestedLevel3 = {
  child: nestedLevel4,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const name = input['name'];
    if (typeof name !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'name'] });
    }

    const level = input['level'];
    if (typeof level !== 'number' || Number.isNaN(level)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'level'] });
    } else if (!Number.isInteger(level)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...path, 'level'],
      });
    }

    const child = this.child._check(input['child'], path, 'child', issues);

    const output: Record<string, unknown> = {};
    output['name'] = name;
    output['level'] = level;
    output['child'] = child;
    return output;
  },
};

const nestedLevel2 = {
  child: nestedLevel3,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const name = input['name'];
    if (typeof name !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'name'] });
    }

    const level = input['level'];
    if (typeof level !== 'number' || Number.isNaN(level)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'level'] });
    } else if (!Number.isInteger(level)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...path, 'level'],
      });
    }

    const child = this.child._check(input['child'], path, 'child', issues);

    const output: Record<string, unknown> = {};
    output['name'] = name;
    output['level'] = level;
    output['child'] = child;
    return output;
  },
};

export const nested = new (class {
  readonly _standalone: boolean = false;
  readonly shape = {};
  readonly child = nestedLevel2;

  get '~standard'(): StandardSchemaProps<NestedInput, NestedOutput> {
    return {
      version: 1,
      vendor: '@pvl/schema',
      types: undefined,
      validate: (value: unknown): Result<NestedOutput> => this.validate(value),
    };
  }

  validate(value: unknown): Result<NestedOutput> {
    return this._validate(value, []) as Result<NestedOutput>;
  }

  _validate(value: unknown, path: Path): Result<unknown> {
    const issues: Issue[] = [];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected object',
        path: path.length > 0 ? path : undefined,
      });
    } else {
      const input = value as Record<string, unknown>;

      const name = input['name'];
      if (typeof name !== 'string') {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'name'] });
      }

      const level = input['level'];
      if (typeof level !== 'number' || Number.isNaN(level)) {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'level'] });
      } else if (!Number.isInteger(level)) {
        issues.push({
          code: 'NOT_INTEGER',
          message: 'Number must be an integer',
          path: [...path, 'level'],
        });
      }

      const child = this.child._check(input['child'], path, 'child', issues);

      const output: Record<string, unknown> = {};
      output['name'] = name;
      output['level'] = level;
      output['child'] = child;
      value = output;
    }
    return issues.length > 0 ? { issues } : { value };
  }

  standalone(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this) as object) as this, this, {
      _standalone: true,
    });
  }
})();

const listItem = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const id = input['id'];
    if (typeof id !== 'number' || Number.isNaN(id)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'id'] });
    } else {
      if (!Number.isInteger(id)) {
        issues.push({
          code: 'NOT_INTEGER',
          message: 'Number must be an integer',
          path: [...path, 'id'],
        });
      }
      if (id < 1) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'Number must be greater than or equal to 1',
          path: [...path, 'id'],
        });
      }
    }

    const name = input['name'];
    if (typeof name !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'name'] });
    } else if (name.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...path, 'name'],
      });
    }

    const price = input['price'];
    if (typeof price !== 'number' || Number.isNaN(price)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'price'] });
    } else if (price < 0) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'Number must be greater than or equal to 0',
        path: [...path, 'price'],
      });
    }

    const inStock = input['inStock'];
    if (typeof inStock !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...path, 'inStock'],
      });
    }

    const output: Record<string, unknown> = {};
    output['id'] = id;
    output['name'] = name;
    output['price'] = price;
    output['inStock'] = inStock;
    return output;
  },
};

export const list = new (class {
  readonly _standalone: boolean = false;
  readonly item = listItem;

  readonly element = pvl.object({
    id: pvl.number().int().min(1),
    name: pvl.string().min(1),
    price: pvl.number().min(0),
    inStock: pvl.boolean(),
  });

  get '~standard'(): StandardSchemaProps<ListInput, ListOutput> {
    return {
      version: 1,
      vendor: '@pvl/schema',
      types: undefined,
      validate: (value: unknown): Result<ListOutput> => this.validate(value),
    };
  }

  validate(value: unknown): Result<ListOutput> {
    return this._validate(value, []) as Result<ListOutput>;
  }

  _validate(value: unknown, path: Path): Result<unknown> {
    const issues: Issue[] = [];
    if (Array.isArray(value)) {
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index++) {
        output.push(this.item._check(value[index], path, index, issues));
      }
      value = output;
    } else {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected array',
        path: path.length > 0 ? path : undefined,
      });
    }
    return issues.length > 0 ? { issues } : { value };
  }

  standalone(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this) as object) as this, this, {
      _standalone: true,
    });
  }
})();

const address = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const street = input['street'];
    if (typeof street !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'street'] });
    } else if (street.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...path, 'street'],
      });
    }

    const city = input['city'];
    if (typeof city !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'city'] });
    } else if (city.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...path, 'city'],
      });
    }

    const zip = input['zip'];
    if (typeof zip !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'zip'] });
    } else if (zip.length !== 5) {
      issues.push({
        code: 'INVALID_LENGTH',
        message: 'String must contain exactly 5 character(s)',
        path: [...path, 'zip'],
      });
    }

    const country = input['country'];
    if (
      country !== 'CZ' &&
      country !== 'SK' &&
      country !== 'DE' &&
      country !== 'AT' &&
      country !== 'PL'
    ) {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "CZ", "SK", "DE", "AT", "PL"',
        path: [...path, 'country'],
      });
    }

    const output: Record<string, unknown> = {};
    output['street'] = street;
    output['city'] = city;
    output['zip'] = zip;
    output['country'] = country;
    return output;
  },
};

export const reused = new (class {
  readonly _standalone: boolean = false;
  readonly shape = {};
  readonly address = address;

  get '~standard'(): StandardSchemaProps<ReusedInput, ReusedOutput> {
    return {
      version: 1,
      vendor: '@pvl/schema',
      types: undefined,
      validate: (value: unknown): Result<ReusedOutput> => this.validate(value),
    };
  }

  validate(value: unknown): Result<ReusedOutput> {
    return this._validate(value, []) as Result<ReusedOutput>;
  }

  _validate(value: unknown, path: Path): Result<unknown> {
    const issues: Issue[] = [];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected object',
        path: path.length > 0 ? path : undefined,
      });
    } else {
      const input = value as Record<string, unknown>;
      const home = this.address._check(input['home'], path, 'home', issues);
      const work = this.address._check(input['work'], path, 'work', issues);
      const billing = this.address._check(input['billing'], path, 'billing', issues);
      const shipping = this.address._check(input['shipping'], path, 'shipping', issues);
      const previous = this.address._check(input['previous'], path, 'previous', issues);

      const output: Record<string, unknown> = {};
      output['home'] = home;
      output['work'] = work;
      output['billing'] = billing;
      output['shipping'] = shipping;
      output['previous'] = previous;
      value = output;
    }
    return issues.length > 0 ? { issues } : { value };
  }

  standalone(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this) as object) as this, this, {
      _standalone: true,
    });
  }
})();

const wideC = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const c1 = input['c1'];
    if (typeof c1 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'c1'] });
    }
    const c2 = input['c2'];
    if (typeof c2 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'c2'] });
    } else if (c2.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...path, 'c2'],
      });
    }
    const c3 = input['c3'];
    if (typeof c3 !== 'number' || Number.isNaN(c3)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'c3'] });
    }
    const c4 = input['c4'];
    if (typeof c4 !== 'number' || Number.isNaN(c4)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'c4'] });
    } else if (!Number.isInteger(c4)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...path, 'c4'],
      });
    }
    const c5 = input['c5'];
    if (typeof c5 !== 'boolean') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected boolean', path: [...path, 'c5'] });
    }
    const c6 = input['c6'];
    if (c6 !== undefined && typeof c6 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'c6'] });
    }
    const c7 = input['c7'];
    if (c7 !== null && (typeof c7 !== 'number' || Number.isNaN(c7))) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'c7'] });
    }
    const c8 = input['c8'];
    if (c8 !== 'x' && c8 !== 'y' && c8 !== 'z') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "x", "y", "z"',
        path: [...path, 'c8'],
      });
    }
    const c9 = input['c9'];
    if (!Object.is(c9, 9)) {
      issues.push({ code: 'INVALID_VALUE', message: 'Expected 9', path: [...path, 'c9'] });
    }
    const c10 = input['c10'];
    if (typeof c10 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'c10'] });
    } else if (c10.length > 100) {
      issues.push({
        code: 'TOO_BIG',
        message: 'String must contain at most 100 character(s)',
        path: [...path, 'c10'],
      });
    }

    const output: Record<string, unknown> = {};
    output['c1'] = c1;
    output['c2'] = c2;
    output['c3'] = c3;
    output['c4'] = c4;
    output['c5'] = c5;
    if (c6 !== undefined || Object.hasOwn(input, 'c6')) {
      output['c6'] = c6;
    }
    output['c7'] = c7;
    output['c8'] = c8;
    output['c9'] = c9;
    output['c10'] = c10;
    return output;
  },
};

const wideB = {
  c: wideC,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const b1 = input['b1'];
    if (typeof b1 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'b1'] });
    }
    const b2 = input['b2'];
    if (typeof b2 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'b2'] });
    } else if (b2.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...path, 'b2'],
      });
    }
    const b3 = input['b3'];
    if (typeof b3 !== 'number' || Number.isNaN(b3)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'b3'] });
    }
    const b4 = input['b4'];
    if (typeof b4 !== 'number' || Number.isNaN(b4)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'b4'] });
    } else if (!Number.isInteger(b4)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...path, 'b4'],
      });
    }
    const b5 = input['b5'];
    if (typeof b5 !== 'boolean') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected boolean', path: [...path, 'b5'] });
    }
    const b6 = input['b6'];
    if (b6 !== undefined && typeof b6 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'b6'] });
    }
    const b7 = input['b7'];
    if (b7 !== null && (typeof b7 !== 'number' || Number.isNaN(b7))) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'b7'] });
    }
    const b8 = input['b8'];
    if (b8 !== 'x' && b8 !== 'y' && b8 !== 'z') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "x", "y", "z"',
        path: [...path, 'b8'],
      });
    }
    const b9 = input['b9'];
    if (!Object.is(b9, 9)) {
      issues.push({ code: 'INVALID_VALUE', message: 'Expected 9', path: [...path, 'b9'] });
    }
    const b10 = input['b10'];
    if (typeof b10 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'b10'] });
    } else if (b10.length > 100) {
      issues.push({
        code: 'TOO_BIG',
        message: 'String must contain at most 100 character(s)',
        path: [...path, 'b10'],
      });
    }
    const c = this.c._check(input['c'], path, 'c', issues);

    const output: Record<string, unknown> = {};
    output['b1'] = b1;
    output['b2'] = b2;
    output['b3'] = b3;
    output['b4'] = b4;
    output['b5'] = b5;
    if (b6 !== undefined || Object.hasOwn(input, 'b6')) {
      output['b6'] = b6;
    }
    output['b7'] = b7;
    output['b8'] = b8;
    output['b9'] = b9;
    output['b10'] = b10;
    output['c'] = c;
    return output;
  },
};

const wideE = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const e1 = input['e1'];
    if (typeof e1 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'e1'] });
    }
    const e2 = input['e2'];
    if (typeof e2 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'e2'] });
    } else if (e2.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...path, 'e2'],
      });
    }
    const e3 = input['e3'];
    if (typeof e3 !== 'number' || Number.isNaN(e3)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'e3'] });
    }
    const e4 = input['e4'];
    if (typeof e4 !== 'number' || Number.isNaN(e4)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'e4'] });
    } else if (!Number.isInteger(e4)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...path, 'e4'],
      });
    }
    const e5 = input['e5'];
    if (typeof e5 !== 'boolean') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected boolean', path: [...path, 'e5'] });
    }
    const e6 = input['e6'];
    if (e6 !== undefined && typeof e6 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'e6'] });
    }
    const e7 = input['e7'];
    if (e7 !== null && (typeof e7 !== 'number' || Number.isNaN(e7))) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'e7'] });
    }
    const e8 = input['e8'];
    if (e8 !== 'x' && e8 !== 'y' && e8 !== 'z') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "x", "y", "z"',
        path: [...path, 'e8'],
      });
    }
    const e9 = input['e9'];
    if (!Object.is(e9, 9)) {
      issues.push({ code: 'INVALID_VALUE', message: 'Expected 9', path: [...path, 'e9'] });
    }
    const e10 = input['e10'];
    if (typeof e10 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'e10'] });
    } else if (e10.length > 100) {
      issues.push({
        code: 'TOO_BIG',
        message: 'String must contain at most 100 character(s)',
        path: [...path, 'e10'],
      });
    }

    const output: Record<string, unknown> = {};
    output['e1'] = e1;
    output['e2'] = e2;
    output['e3'] = e3;
    output['e4'] = e4;
    output['e5'] = e5;
    if (e6 !== undefined || Object.hasOwn(input, 'e6')) {
      output['e6'] = e6;
    }
    output['e7'] = e7;
    output['e8'] = e8;
    output['e9'] = e9;
    output['e10'] = e10;
    return output;
  },
};

const wideD = {
  e: wideE,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const d1 = input['d1'];
    if (typeof d1 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'd1'] });
    }
    const d2 = input['d2'];
    if (typeof d2 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'd2'] });
    } else if (d2.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...path, 'd2'],
      });
    }
    const d3 = input['d3'];
    if (typeof d3 !== 'number' || Number.isNaN(d3)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'd3'] });
    }
    const d4 = input['d4'];
    if (typeof d4 !== 'number' || Number.isNaN(d4)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'd4'] });
    } else if (!Number.isInteger(d4)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...path, 'd4'],
      });
    }
    const d5 = input['d5'];
    if (typeof d5 !== 'boolean') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected boolean', path: [...path, 'd5'] });
    }
    const d6 = input['d6'];
    if (d6 !== undefined && typeof d6 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'd6'] });
    }
    const d7 = input['d7'];
    if (d7 !== null && (typeof d7 !== 'number' || Number.isNaN(d7))) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'd7'] });
    }
    const d8 = input['d8'];
    if (d8 !== 'x' && d8 !== 'y' && d8 !== 'z') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "x", "y", "z"',
        path: [...path, 'd8'],
      });
    }
    const d9 = input['d9'];
    if (!Object.is(d9, 9)) {
      issues.push({ code: 'INVALID_VALUE', message: 'Expected 9', path: [...path, 'd9'] });
    }
    const d10 = input['d10'];
    if (typeof d10 !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'd10'] });
    } else if (d10.length > 100) {
      issues.push({
        code: 'TOO_BIG',
        message: 'String must contain at most 100 character(s)',
        path: [...path, 'd10'],
      });
    }
    const e = this.e._check(input['e'], path, 'e', issues);

    const output: Record<string, unknown> = {};
    output['d1'] = d1;
    output['d2'] = d2;
    output['d3'] = d3;
    output['d4'] = d4;
    output['d5'] = d5;
    if (d6 !== undefined || Object.hasOwn(input, 'd6')) {
      output['d6'] = d6;
    }
    output['d7'] = d7;
    output['d8'] = d8;
    output['d9'] = d9;
    output['d10'] = d10;
    output['e'] = e;
    return output;
  },
};

export const wide = new (class {
  readonly _standalone: boolean = false;
  readonly shape = {};
  readonly b = wideB;
  readonly d = wideD;

  get '~standard'(): StandardSchemaProps<WideInput, WideOutput> {
    return {
      version: 1,
      vendor: '@pvl/schema',
      types: undefined,
      validate: (value: unknown): Result<WideOutput> => this.validate(value),
    };
  }

  validate(value: unknown): Result<WideOutput> {
    return this._validate(value, []) as Result<WideOutput>;
  }

  _validate(value: unknown, path: Path): Result<unknown> {
    const issues: Issue[] = [];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected object',
        path: path.length > 0 ? path : undefined,
      });
    } else {
      const input = value as Record<string, unknown>;

      const a1 = input['a1'];
      if (typeof a1 !== 'string') {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'a1'] });
      }
      const a2 = input['a2'];
      if (typeof a2 !== 'string') {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'a2'] });
      } else if (a2.length < 1) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'String must contain at least 1 character(s)',
          path: [...path, 'a2'],
        });
      }
      const a3 = input['a3'];
      if (typeof a3 !== 'number' || Number.isNaN(a3)) {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'a3'] });
      }
      const a4 = input['a4'];
      if (typeof a4 !== 'number' || Number.isNaN(a4)) {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'a4'] });
      } else if (!Number.isInteger(a4)) {
        issues.push({
          code: 'NOT_INTEGER',
          message: 'Number must be an integer',
          path: [...path, 'a4'],
        });
      }
      const a5 = input['a5'];
      if (typeof a5 !== 'boolean') {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected boolean', path: [...path, 'a5'] });
      }
      const a6 = input['a6'];
      if (a6 !== undefined && typeof a6 !== 'string') {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'a6'] });
      }
      const a7 = input['a7'];
      if (a7 !== null && (typeof a7 !== 'number' || Number.isNaN(a7))) {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'a7'] });
      }
      const a8 = input['a8'];
      if (a8 !== 'x' && a8 !== 'y' && a8 !== 'z') {
        issues.push({
          code: 'INVALID_VALUE',
          message: 'Expected one of "x", "y", "z"',
          path: [...path, 'a8'],
        });
      }
      const a9 = input['a9'];
      if (!Object.is(a9, 9)) {
        issues.push({ code: 'INVALID_VALUE', message: 'Expected 9', path: [...path, 'a9'] });
      }
      const a10 = input['a10'];
      if (typeof a10 !== 'string') {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'a10'] });
      } else if (a10.length > 100) {
        issues.push({
          code: 'TOO_BIG',
          message: 'String must contain at most 100 character(s)',
          path: [...path, 'a10'],
        });
      }
      const b = this.b._check(input['b'], path, 'b', issues);
      const d = this.d._check(input['d'], path, 'd', issues);

      const output: Record<string, unknown> = {};
      output['a1'] = a1;
      output['a2'] = a2;
      output['a3'] = a3;
      output['a4'] = a4;
      output['a5'] = a5;
      if (a6 !== undefined || Object.hasOwn(input, 'a6')) {
        output['a6'] = a6;
      }
      output['a7'] = a7;
      output['a8'] = a8;
      output['a9'] = a9;
      output['a10'] = a10;
      output['b'] = b;
      output['d'] = d;
      value = output;
    }
    return issues.length > 0 ? { issues } : { value };
  }

  standalone(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this) as object) as this, this, {
      _standalone: true,
    });
  }
})();

const money = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const amount = input['amount'];
    if (typeof amount !== 'number' || Number.isNaN(amount)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...path, 'amount'] });
    } else {
      if (!Number.isInteger(amount)) {
        issues.push({
          code: 'NOT_INTEGER',
          message: 'Number must be an integer',
          path: [...path, 'amount'],
        });
      }
      if (amount < 0) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'Number must be greater than or equal to 0',
          path: [...path, 'amount'],
        });
      }
    }

    const currency = input['currency'];
    if (currency !== 'CZK' && currency !== 'EUR' && currency !== 'USD') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "CZK", "EUR", "USD"',
        path: [...path, 'currency'],
      });
    }

    const output: Record<string, unknown> = {};
    output['amount'] = amount;
    output['currency'] = currency;
    return output;
  },
};

const contact = {
  address,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const name = input['name'];
    if (typeof name !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'name'] });
    } else {
      if (name.length < 1) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'String must contain at least 1 character(s)',
          path: [...path, 'name'],
        });
      }
      if (name.length > 128) {
        issues.push({
          code: 'TOO_BIG',
          message: 'String must contain at most 128 character(s)',
          path: [...path, 'name'],
        });
      }
    }

    const email = input['email'];
    if (typeof email !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'email'] });
    } else if (email.length < 3) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 3 character(s)',
        path: [...path, 'email'],
      });
    }

    const phone = input['phone'];
    if (phone !== undefined) {
      if (typeof phone !== 'string') {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'phone'] });
      } else if (phone.length < 9) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'String must contain at least 9 character(s)',
          path: [...path, 'phone'],
        });
      }
    }

    const addressOutput = this.address._check(input['address'], path, 'address', issues);

    const output: Record<string, unknown> = {};
    output['name'] = name;
    output['email'] = email;
    if (phone !== undefined || Object.hasOwn(input, 'phone')) {
      output['phone'] = phone;
    }
    output['address'] = addressOutput;
    return output;
  },
};

const discount = {
  money,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const code = input['code'];
    if (typeof code !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'code'] });
    } else if (code.length < 3) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 3 character(s)',
        path: [...path, 'code'],
      });
    }

    const amount = this.money._check(input['amount'], path, 'amount', issues);

    const stackable = input['stackable'];
    if (typeof stackable !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...path, 'stackable'],
      });
    }

    const output: Record<string, unknown> = {};
    output['code'] = code;
    output['amount'] = amount;
    output['stackable'] = stackable;
    return output;
  },
};

const discounts = {
  discount,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected array', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      output.push(this.discount._check(value[index], path, index, issues));
    }
    return output;
  },
};

const attribute = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const issueCount = issues.length;
    const input = value as Record<string, unknown>;

    const name = input['name'];
    if (typeof name !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'name'] });
    } else if (name.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...path, 'name'],
      });
    }

    const attributeValue = input['value'];
    if (typeof attributeValue !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'value'] });
    }

    const output: Record<string, unknown> = {};
    output['name'] = name;
    output['value'] = attributeValue;
    if (issues.length === issueCount) {
      for (const inputKey of Object.keys(input)) {
        if (inputKey !== 'name' && inputKey !== 'value') {
          issues.push({
            code: 'UNRECOGNIZED_KEY',
            message: `Unrecognized key "${inputKey}"`,
            path: [...path, inputKey],
          });
        }
      }
    }
    return output;
  },
};

const attributes = {
  attribute,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected array', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      output.push(this.attribute._check(value[index], path, index, issues));
    }
    return output;
  },
};

const line = {
  money,
  discounts,
  attributes,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const issueCount = issues.length;
    const input = value as Record<string, unknown>;

    const sku = input['sku'];
    if (typeof sku !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'sku'] });
    } else {
      if (sku.length < 4) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'String must contain at least 4 character(s)',
          path: [...path, 'sku'],
        });
      }
      if (sku.length > 32) {
        issues.push({
          code: 'TOO_BIG',
          message: 'String must contain at most 32 character(s)',
          path: [...path, 'sku'],
        });
      }
    }

    const quantity = input['quantity'];
    if (typeof quantity !== 'number' || Number.isNaN(quantity)) {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected number',
        path: [...path, 'quantity'],
      });
    } else {
      if (!Number.isInteger(quantity)) {
        issues.push({
          code: 'NOT_INTEGER',
          message: 'Number must be an integer',
          path: [...path, 'quantity'],
        });
      }
      if (quantity < 1) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'Number must be greater than or equal to 1',
          path: [...path, 'quantity'],
        });
      }
      if (quantity > 999) {
        issues.push({
          code: 'TOO_BIG',
          message: 'Number must be less than or equal to 999',
          path: [...path, 'quantity'],
        });
      }
    }

    const unitPrice = this.money._check(input['unitPrice'], path, 'unitPrice', issues);
    const discountsOutput = this.discounts._check(input['discounts'], path, 'discounts', issues);
    const attributesOutput = this.attributes._check(
      input['attributes'],
      path,
      'attributes',
      issues,
    );

    const note = input['note'];
    if (note !== null && note !== undefined) {
      if (typeof note !== 'string') {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'note'] });
      } else if (note.length > 500) {
        issues.push({
          code: 'TOO_BIG',
          message: 'String must contain at most 500 character(s)',
          path: [...path, 'note'],
        });
      }
    }

    const output: Record<string, unknown> = {};
    output['sku'] = sku;
    output['quantity'] = quantity;
    output['unitPrice'] = unitPrice;
    output['discounts'] = discountsOutput;
    output['attributes'] = attributesOutput;
    if (note !== undefined || Object.hasOwn(input, 'note')) {
      output['note'] = note;
    }
    if (issues.length === issueCount) {
      for (const inputKey of Object.keys(input)) {
        if (
          inputKey !== 'sku' &&
          inputKey !== 'quantity' &&
          inputKey !== 'unitPrice' &&
          inputKey !== 'discounts' &&
          inputKey !== 'attributes' &&
          inputKey !== 'note'
        ) {
          issues.push({
            code: 'UNRECOGNIZED_KEY',
            message: `Unrecognized key "${inputKey}"`,
            path: [...path, inputKey],
          });
        }
      }
    }
    return output;
  },
};

const lines = {
  line,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected array', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const issueCount = issues.length;
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      output.push(this.line._check(value[index], path, index, issues));
    }
    if (issues.length === issueCount) {
      if (output.length < 1) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'Array must contain at least 1 element(s)',
          path: [...parentPath, key],
        });
      }
      if (output.length > 500) {
        issues.push({
          code: 'TOO_BIG',
          message: 'Array must contain at most 500 element(s)',
          path: [...parentPath, key],
        });
      }
    }
    return output;
  },
};

const refund = {
  money,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const amount = this.money._check(input['amount'], path, 'amount', issues);

    const reason = input['reason'];
    if (typeof reason !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'reason'] });
    } else if (reason.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...path, 'reason'],
      });
    }

    const output: Record<string, unknown> = {};
    output['amount'] = amount;
    output['reason'] = reason;
    return output;
  },
};

const refunds = {
  refund,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected array', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      output.push(this.refund._check(value[index], path, index, issues));
    }
    return output;
  },
};

const payment = {
  money,
  refunds,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const method = input['method'];
    if (method !== 'card' && method !== 'transfer' && method !== 'cash') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "card", "transfer", "cash"',
        path: [...path, 'method'],
      });
    }

    const paid = this.money._check(input['paid'], path, 'paid', issues);

    const reference = input['reference'];
    if (reference !== null && typeof reference !== 'string') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected string',
        path: [...path, 'reference'],
      });
    }

    const refundsOutput = this.refunds._check(input['refunds'], path, 'refunds', issues);

    const output: Record<string, unknown> = {};
    output['method'] = method;
    output['paid'] = paid;
    output['reference'] = reference;
    output['refunds'] = refundsOutput;
    return output;
  },
};

const payments = {
  payment,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected array', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      output.push(this.payment._check(value[index], path, index, issues));
    }
    return output;
  },
};

const tags = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected array', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const issueCount = issues.length;
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      const element: unknown = value[index];
      if (typeof element !== 'string') {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, index] });
      } else if (element.length < 1) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'String must contain at least 1 character(s)',
          path: [...path, index],
        });
      }
      output.push(element);
    }
    if (issues.length === issueCount && output.length > 20) {
      issues.push({
        code: 'TOO_BIG',
        message: 'Array must contain at most 20 element(s)',
        path: [...parentPath, key],
      });
    }
    return output;
  },
};

const flags = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const gift = input['gift'];
    if (typeof gift !== 'boolean') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected boolean', path: [...path, 'gift'] });
    }
    const priority = input['priority'];
    if (typeof priority !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...path, 'priority'],
      });
    }
    const fragile = input['fragile'];
    if (typeof fragile !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...path, 'fragile'],
      });
    }

    const output: Record<string, unknown> = {};
    output['gift'] = gift;
    output['priority'] = priority;
    output['fragile'] = fragile;
    return output;
  },
};

const metadata = {
  flags,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;

    const source = input['source'];
    if (source !== 'web' && source !== 'app' && source !== 'pos') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "web", "app", "pos"',
        path: [...path, 'source'],
      });
    }

    const campaign = input['campaign'];
    if (campaign !== undefined && typeof campaign !== 'string') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected string',
        path: [...path, 'campaign'],
      });
    }

    const flagsOutput = this.flags._check(input['flags'], path, 'flags', issues);

    const output: Record<string, unknown> = {};
    output['source'] = source;
    if (campaign !== undefined || Object.hasOwn(input, 'campaign')) {
      output['campaign'] = campaign;
    }
    output['flags'] = flagsOutput;
    for (const inputKey of Object.keys(input)) {
      if (inputKey !== 'source' && inputKey !== 'campaign' && inputKey !== 'flags') {
        if (inputKey === '__proto__') {
          Object.defineProperty(output, inputKey, {
            value: input[inputKey],
            writable: true,
            enumerable: true,
            configurable: true,
          });
        } else {
          output[inputKey] = input[inputKey];
        }
      }
    }
    return output;
  },
};

const order = {
  contact,
  lines,
  payments,
  money,
  tags,
  metadata,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const issueCount = issues.length;
    const input = value as Record<string, unknown>;

    const id = input['id'];
    if (typeof id !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'id'] });
    } else if (id.length !== 36) {
      issues.push({
        code: 'INVALID_LENGTH',
        message: 'String must contain exactly 36 character(s)',
        path: [...path, 'id'],
      });
    }

    const kind = input['kind'];
    if (!Object.is(kind, 'order')) {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected "order"',
        path: [...path, 'kind'],
      });
    }

    const status = input['status'];
    if (
      status !== 'new' &&
      status !== 'paid' &&
      status !== 'shipped' &&
      status !== 'delivered' &&
      status !== 'cancelled'
    ) {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "new", "paid", "shipped", "delivered", "cancelled"',
        path: [...path, 'status'],
      });
    }

    const createdAt = input['createdAt'];
    if (typeof createdAt !== 'number' || Number.isNaN(createdAt)) {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected number',
        path: [...path, 'createdAt'],
      });
    } else if (!Number.isInteger(createdAt)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...path, 'createdAt'],
      });
    }

    const customer = this.contact._check(input['customer'], path, 'customer', issues);

    let shippingTo = input['shippingTo'];
    if (shippingTo !== undefined) {
      shippingTo = this.contact._check(shippingTo, path, 'shippingTo', issues);
    }

    const linesOutput = this.lines._check(input['lines'], path, 'lines', issues);
    const paymentsOutput = this.payments._check(input['payments'], path, 'payments', issues);
    const total = this.money._check(input['total'], path, 'total', issues);
    const tagsOutput = this.tags._check(input['tags'], path, 'tags', issues);
    const metadataOutput = this.metadata._check(input['metadata'], path, 'metadata', issues);

    const output: Record<string, unknown> = {};
    output['id'] = id;
    output['kind'] = kind;
    output['status'] = status;
    output['createdAt'] = createdAt;
    output['customer'] = customer;
    if (shippingTo !== undefined || Object.hasOwn(input, 'shippingTo')) {
      output['shippingTo'] = shippingTo;
    }
    output['lines'] = linesOutput;
    output['payments'] = paymentsOutput;
    output['total'] = total;
    output['tags'] = tagsOutput;
    output['metadata'] = metadataOutput;
    if (issues.length === issueCount) {
      for (const inputKey of Object.keys(input)) {
        if (
          inputKey !== 'id' &&
          inputKey !== 'kind' &&
          inputKey !== 'status' &&
          inputKey !== 'createdAt' &&
          inputKey !== 'customer' &&
          inputKey !== 'shippingTo' &&
          inputKey !== 'lines' &&
          inputKey !== 'payments' &&
          inputKey !== 'total' &&
          inputKey !== 'tags' &&
          inputKey !== 'metadata'
        ) {
          issues.push({
            code: 'UNRECOGNIZED_KEY',
            message: `Unrecognized key "${inputKey}"`,
            path: [...path, inputKey],
          });
        }
      }
    }
    return output;
  },
};

export const complex = new (class {
  readonly _standalone: boolean = false;
  readonly shape = {};
  readonly contact = contact;
  readonly lines = lines;
  readonly payments = payments;
  readonly money = money;
  readonly tags = tags;
  readonly metadata = metadata;

  get '~standard'(): StandardSchemaProps<ComplexInput, ComplexOutput> {
    return {
      version: 1,
      vendor: '@pvl/schema',
      types: undefined,
      validate: (value: unknown): Result<ComplexOutput> => this.validate(value),
    };
  }

  validate(value: unknown): Result<ComplexOutput> {
    return this._validate(value, []) as Result<ComplexOutput>;
  }

  _validate(value: unknown, path: Path): Result<unknown> {
    const issues: Issue[] = [];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected object',
        path: path.length > 0 ? path : undefined,
      });
    } else {
      const issueCount = issues.length;
      const input = value as Record<string, unknown>;

      const id = input['id'];
      if (typeof id !== 'string') {
        issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...path, 'id'] });
      } else if (id.length !== 36) {
        issues.push({
          code: 'INVALID_LENGTH',
          message: 'String must contain exactly 36 character(s)',
          path: [...path, 'id'],
        });
      }

      const kind = input['kind'];
      if (!Object.is(kind, 'order')) {
        issues.push({
          code: 'INVALID_VALUE',
          message: 'Expected "order"',
          path: [...path, 'kind'],
        });
      }

      const status = input['status'];
      if (
        status !== 'new' &&
        status !== 'paid' &&
        status !== 'shipped' &&
        status !== 'delivered' &&
        status !== 'cancelled'
      ) {
        issues.push({
          code: 'INVALID_VALUE',
          message: 'Expected one of "new", "paid", "shipped", "delivered", "cancelled"',
          path: [...path, 'status'],
        });
      }

      const createdAt = input['createdAt'];
      if (typeof createdAt !== 'number' || Number.isNaN(createdAt)) {
        issues.push({
          code: 'INVALID_TYPE',
          message: 'Expected number',
          path: [...path, 'createdAt'],
        });
      } else if (!Number.isInteger(createdAt)) {
        issues.push({
          code: 'NOT_INTEGER',
          message: 'Number must be an integer',
          path: [...path, 'createdAt'],
        });
      }

      const customer = this.contact._check(input['customer'], path, 'customer', issues);

      let shippingTo = input['shippingTo'];
      if (shippingTo !== undefined) {
        shippingTo = this.contact._check(shippingTo, path, 'shippingTo', issues);
      }

      const linesOutput = this.lines._check(input['lines'], path, 'lines', issues);
      const paymentsOutput = this.payments._check(input['payments'], path, 'payments', issues);
      const total = this.money._check(input['total'], path, 'total', issues);
      const tagsOutput = this.tags._check(input['tags'], path, 'tags', issues);
      const metadataOutput = this.metadata._check(input['metadata'], path, 'metadata', issues);

      const output: Record<string, unknown> = {};
      output['id'] = id;
      output['kind'] = kind;
      output['status'] = status;
      output['createdAt'] = createdAt;
      output['customer'] = customer;
      if (shippingTo !== undefined || Object.hasOwn(input, 'shippingTo')) {
        output['shippingTo'] = shippingTo;
      }
      output['lines'] = linesOutput;
      output['payments'] = paymentsOutput;
      output['total'] = total;
      output['tags'] = tagsOutput;
      output['metadata'] = metadataOutput;
      if (issues.length === issueCount) {
        for (const inputKey of Object.keys(input)) {
          if (
            inputKey !== 'id' &&
            inputKey !== 'kind' &&
            inputKey !== 'status' &&
            inputKey !== 'createdAt' &&
            inputKey !== 'customer' &&
            inputKey !== 'shippingTo' &&
            inputKey !== 'lines' &&
            inputKey !== 'payments' &&
            inputKey !== 'total' &&
            inputKey !== 'tags' &&
            inputKey !== 'metadata'
          ) {
            issues.push({
              code: 'UNRECOGNIZED_KEY',
              message: `Unrecognized key "${inputKey}"`,
              path: [...path, inputKey],
            });
          }
        }
      }
      value = output;
    }
    return issues.length > 0 ? { issues } : { value };
  }

  standalone(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this) as object) as this, this, {
      _standalone: true,
    });
  }
})();

// `huge` is six orders under one root, each a call to one shared `order` child.
export const huge = new (class {
  readonly _standalone: boolean = false;
  readonly shape = {};
  readonly order = order;

  get '~standard'(): StandardSchemaProps<HugeInput, HugeOutput> {
    return {
      version: 1,
      vendor: '@pvl/schema',
      types: undefined,
      validate: (value: unknown): Result<HugeOutput> => this.validate(value),
    };
  }

  validate(value: unknown): Result<HugeOutput> {
    return this._validate(value, []) as Result<HugeOutput>;
  }

  _validate(value: unknown, path: Path): Result<unknown> {
    const issues: Issue[] = [];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected object',
        path: path.length > 0 ? path : undefined,
      });
    } else {
      const input = value as Record<string, unknown>;
      const o1 = this.order._check(input['o1'], path, 'o1', issues);
      const o2 = this.order._check(input['o2'], path, 'o2', issues);
      const o3 = this.order._check(input['o3'], path, 'o3', issues);
      const o4 = this.order._check(input['o4'], path, 'o4', issues);
      const o5 = this.order._check(input['o5'], path, 'o5', issues);
      const o6 = this.order._check(input['o6'], path, 'o6', issues);

      const output: Record<string, unknown> = {};
      output['o1'] = o1;
      output['o2'] = o2;
      output['o3'] = o3;
      output['o4'] = o4;
      output['o5'] = o5;
      output['o6'] = o6;
      value = output;
    }
    return issues.length > 0 ? { issues } : { value };
  }

  standalone(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this) as object) as this, this, {
      _standalone: true,
    });
  }
})();
