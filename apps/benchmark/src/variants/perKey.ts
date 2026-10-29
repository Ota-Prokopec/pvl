// V3 of the benchmark: the Schemas of `src/schemas/benchmark.ts`, hand-split from
// the inline-everything V1 `pvl compile` emits (ADR-0023) down to every key.
// Each key, a primitive one too, and each array's element is a child its
// parent holds as a property and calls, so a parent only calls its children.
// A child pushes into its parent's `issues` and returns its output, and builds
// its path only where V1 does, so the split is the only difference from V1. A
// Schema reused through one `const` is one child, called from each place.
import { pvl } from '@pcvl/schema';
import type { Issue, Result, StandardSchemaProps } from '@pcvl/schema';
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

const flatId = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else {
      if (!Number.isInteger(value)) {
        issues.push({
          code: 'NOT_INTEGER',
          message: 'Number must be an integer',
          path: [...parentPath, key],
        });
      }
      if (value < 1) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'Number must be greater than or equal to 1',
          path: [...parentPath, key],
        });
      }
    }
    return value;
  },
};

const flatName = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else {
      if (value.length < 1) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'String must contain at least 1 character(s)',
          path: [...parentPath, key],
        });
      }
      if (value.length > 64) {
        issues.push({
          code: 'TOO_BIG',
          message: 'String must contain at most 64 character(s)',
          path: [...parentPath, key],
        });
      }
    }
    return value;
  },
};

const flatEmail = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length < 3) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 3 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const flatAge = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else {
      if (!Number.isInteger(value)) {
        issues.push({
          code: 'NOT_INTEGER',
          message: 'Number must be an integer',
          path: [...parentPath, key],
        });
      }
      if (value < 0) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'Number must be greater than or equal to 0',
          path: [...parentPath, key],
        });
      }
      if (value > 150) {
        issues.push({
          code: 'TOO_BIG',
          message: 'Number must be less than or equal to 150',
          path: [...parentPath, key],
        });
      }
    }
    return value;
  },
};

const flatActive = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const flatRole = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== 'admin' && value !== 'editor' && value !== 'viewer') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "admin", "editor", "viewer"',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const flatKind = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Object.is(value, 'user')) {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected "user"',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const flatNickname = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== undefined && typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};

const flatScore = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== null && (typeof value !== 'number' || Number.isNaN(value))) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    }
    return value;
  },
};

const flatCode = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length !== 6) {
      issues.push({
        code: 'INVALID_LENGTH',
        message: 'String must contain exactly 6 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

export const flat = new (class {
  readonly _standalone: boolean = false;
  readonly shape = {};
  readonly id = flatId;
  readonly name = flatName;
  readonly email = flatEmail;
  readonly age = flatAge;
  readonly active = flatActive;
  readonly role = flatRole;
  readonly kind = flatKind;
  readonly nickname = flatNickname;
  readonly score = flatScore;
  readonly code = flatCode;

  get '~standard'(): StandardSchemaProps<FlatInput, FlatOutput> {
    return {
      version: 1,
      vendor: '@pcvl/schema',
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
      const id = this.id._check(input['id'], path, 'id', issues);
      const name = this.name._check(input['name'], path, 'name', issues);
      const email = this.email._check(input['email'], path, 'email', issues);
      const age = this.age._check(input['age'], path, 'age', issues);
      const active = this.active._check(input['active'], path, 'active', issues);
      const role = this.role._check(input['role'], path, 'role', issues);
      const kind = this.kind._check(input['kind'], path, 'kind', issues);
      const nickname = this.nickname._check(input['nickname'], path, 'nickname', issues);
      const score = this.score._check(input['score'], path, 'score', issues);
      const code = this.code._check(input['code'], path, 'code', issues);

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

// Every level of `nested` has its own `name` and `level` child, as each is a key of its own.
const nestedName1 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const nestedLevel1 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else if (!Number.isInteger(value)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const nestedName2 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const nestedLevel2 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else if (!Number.isInteger(value)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const nestedName3 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const nestedLevel3 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else if (!Number.isInteger(value)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const nestedName4 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const nestedLevel4 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else if (!Number.isInteger(value)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const nestedName5 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const nestedLevel5 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else if (!Number.isInteger(value)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const nestedObject5 = {
  name: nestedName5,
  level: nestedLevel5,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const name = this.name._check(input['name'], path, 'name', issues);
    const level = this.level._check(input['level'], path, 'level', issues);

    const output: Record<string, unknown> = {};
    output['name'] = name;
    output['level'] = level;
    return output;
  },
};

const nestedObject4 = {
  name: nestedName4,
  level: nestedLevel4,
  child: nestedObject5,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const name = this.name._check(input['name'], path, 'name', issues);
    const level = this.level._check(input['level'], path, 'level', issues);
    const child = this.child._check(input['child'], path, 'child', issues);

    const output: Record<string, unknown> = {};
    output['name'] = name;
    output['level'] = level;
    output['child'] = child;
    return output;
  },
};

const nestedObject3 = {
  name: nestedName3,
  level: nestedLevel3,
  child: nestedObject4,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const name = this.name._check(input['name'], path, 'name', issues);
    const level = this.level._check(input['level'], path, 'level', issues);
    const child = this.child._check(input['child'], path, 'child', issues);

    const output: Record<string, unknown> = {};
    output['name'] = name;
    output['level'] = level;
    output['child'] = child;
    return output;
  },
};

const nestedObject2 = {
  name: nestedName2,
  level: nestedLevel2,
  child: nestedObject3,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const name = this.name._check(input['name'], path, 'name', issues);
    const level = this.level._check(input['level'], path, 'level', issues);
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
  readonly name = nestedName1;
  readonly level = nestedLevel1;
  readonly child = nestedObject2;

  get '~standard'(): StandardSchemaProps<NestedInput, NestedOutput> {
    return {
      version: 1,
      vendor: '@pcvl/schema',
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
      const name = this.name._check(input['name'], path, 'name', issues);
      const level = this.level._check(input['level'], path, 'level', issues);
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

const listId = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else {
      if (!Number.isInteger(value)) {
        issues.push({
          code: 'NOT_INTEGER',
          message: 'Number must be an integer',
          path: [...parentPath, key],
        });
      }
      if (value < 1) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'Number must be greater than or equal to 1',
          path: [...parentPath, key],
        });
      }
    }
    return value;
  },
};

const listName = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const listPrice = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else if (value < 0) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'Number must be greater than or equal to 0',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const listInStock = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const listItem = {
  id: listId,
  name: listName,
  price: listPrice,
  inStock: listInStock,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const id = this.id._check(input['id'], path, 'id', issues);
    const name = this.name._check(input['name'], path, 'name', issues);
    const price = this.price._check(input['price'], path, 'price', issues);
    const inStock = this.inStock._check(input['inStock'], path, 'inStock', issues);

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
      vendor: '@pcvl/schema',
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

const addressStreet = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const addressCity = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const addressZip = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length !== 5) {
      issues.push({
        code: 'INVALID_LENGTH',
        message: 'String must contain exactly 5 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const addressCountry = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== 'CZ' && value !== 'SK' && value !== 'DE' && value !== 'AT' && value !== 'PL') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "CZ", "SK", "DE", "AT", "PL"',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const address = {
  street: addressStreet,
  city: addressCity,
  zip: addressZip,
  country: addressCountry,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const street = this.street._check(input['street'], path, 'street', issues);
    const city = this.city._check(input['city'], path, 'city', issues);
    const zip = this.zip._check(input['zip'], path, 'zip', issues);
    const country = this.country._check(input['country'], path, 'country', issues);

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
      vendor: '@pcvl/schema',
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

// `wide` repeats one block of ten keys on five objects; each key is a child of its own.
const wideA1 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideA2 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideA3 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideA4 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else if (!Number.isInteger(value)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideA5 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideA6 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== undefined && typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideA7 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== null && (typeof value !== 'number' || Number.isNaN(value))) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideA8 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== 'x' && value !== 'y' && value !== 'z') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "x", "y", "z"',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideA9 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Object.is(value, 9)) {
      issues.push({ code: 'INVALID_VALUE', message: 'Expected 9', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideA10 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length > 100) {
      issues.push({
        code: 'TOO_BIG',
        message: 'String must contain at most 100 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideB1 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideB2 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideB3 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideB4 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else if (!Number.isInteger(value)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideB5 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideB6 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== undefined && typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideB7 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== null && (typeof value !== 'number' || Number.isNaN(value))) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideB8 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== 'x' && value !== 'y' && value !== 'z') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "x", "y", "z"',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideB9 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Object.is(value, 9)) {
      issues.push({ code: 'INVALID_VALUE', message: 'Expected 9', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideB10 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length > 100) {
      issues.push({
        code: 'TOO_BIG',
        message: 'String must contain at most 100 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideC1 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideC2 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideC3 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideC4 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else if (!Number.isInteger(value)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideC5 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideC6 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== undefined && typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideC7 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== null && (typeof value !== 'number' || Number.isNaN(value))) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideC8 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== 'x' && value !== 'y' && value !== 'z') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "x", "y", "z"',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideC9 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Object.is(value, 9)) {
      issues.push({ code: 'INVALID_VALUE', message: 'Expected 9', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideC10 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length > 100) {
      issues.push({
        code: 'TOO_BIG',
        message: 'String must contain at most 100 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideD1 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideD2 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideD3 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideD4 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else if (!Number.isInteger(value)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideD5 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideD6 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== undefined && typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideD7 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== null && (typeof value !== 'number' || Number.isNaN(value))) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideD8 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== 'x' && value !== 'y' && value !== 'z') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "x", "y", "z"',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideD9 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Object.is(value, 9)) {
      issues.push({ code: 'INVALID_VALUE', message: 'Expected 9', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideD10 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length > 100) {
      issues.push({
        code: 'TOO_BIG',
        message: 'String must contain at most 100 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideE1 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideE2 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideE3 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideE4 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else if (!Number.isInteger(value)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideE5 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideE6 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== undefined && typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideE7 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== null && (typeof value !== 'number' || Number.isNaN(value))) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideE8 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== 'x' && value !== 'y' && value !== 'z') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "x", "y", "z"',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};
const wideE9 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Object.is(value, 9)) {
      issues.push({ code: 'INVALID_VALUE', message: 'Expected 9', path: [...parentPath, key] });
    }
    return value;
  },
};
const wideE10 = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length > 100) {
      issues.push({
        code: 'TOO_BIG',
        message: 'String must contain at most 100 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const wideC = {
  c1: wideC1,
  c2: wideC2,
  c3: wideC3,
  c4: wideC4,
  c5: wideC5,
  c6: wideC6,
  c7: wideC7,
  c8: wideC8,
  c9: wideC9,
  c10: wideC10,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const c1 = this.c1._check(input['c1'], path, 'c1', issues);
    const c2 = this.c2._check(input['c2'], path, 'c2', issues);
    const c3 = this.c3._check(input['c3'], path, 'c3', issues);
    const c4 = this.c4._check(input['c4'], path, 'c4', issues);
    const c5 = this.c5._check(input['c5'], path, 'c5', issues);
    const c6 = this.c6._check(input['c6'], path, 'c6', issues);
    const c7 = this.c7._check(input['c7'], path, 'c7', issues);
    const c8 = this.c8._check(input['c8'], path, 'c8', issues);
    const c9 = this.c9._check(input['c9'], path, 'c9', issues);
    const c10 = this.c10._check(input['c10'], path, 'c10', issues);

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
  b1: wideB1,
  b2: wideB2,
  b3: wideB3,
  b4: wideB4,
  b5: wideB5,
  b6: wideB6,
  b7: wideB7,
  b8: wideB8,
  b9: wideB9,
  b10: wideB10,
  c: wideC,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const b1 = this.b1._check(input['b1'], path, 'b1', issues);
    const b2 = this.b2._check(input['b2'], path, 'b2', issues);
    const b3 = this.b3._check(input['b3'], path, 'b3', issues);
    const b4 = this.b4._check(input['b4'], path, 'b4', issues);
    const b5 = this.b5._check(input['b5'], path, 'b5', issues);
    const b6 = this.b6._check(input['b6'], path, 'b6', issues);
    const b7 = this.b7._check(input['b7'], path, 'b7', issues);
    const b8 = this.b8._check(input['b8'], path, 'b8', issues);
    const b9 = this.b9._check(input['b9'], path, 'b9', issues);
    const b10 = this.b10._check(input['b10'], path, 'b10', issues);
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
  e1: wideE1,
  e2: wideE2,
  e3: wideE3,
  e4: wideE4,
  e5: wideE5,
  e6: wideE6,
  e7: wideE7,
  e8: wideE8,
  e9: wideE9,
  e10: wideE10,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const e1 = this.e1._check(input['e1'], path, 'e1', issues);
    const e2 = this.e2._check(input['e2'], path, 'e2', issues);
    const e3 = this.e3._check(input['e3'], path, 'e3', issues);
    const e4 = this.e4._check(input['e4'], path, 'e4', issues);
    const e5 = this.e5._check(input['e5'], path, 'e5', issues);
    const e6 = this.e6._check(input['e6'], path, 'e6', issues);
    const e7 = this.e7._check(input['e7'], path, 'e7', issues);
    const e8 = this.e8._check(input['e8'], path, 'e8', issues);
    const e9 = this.e9._check(input['e9'], path, 'e9', issues);
    const e10 = this.e10._check(input['e10'], path, 'e10', issues);

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
  d1: wideD1,
  d2: wideD2,
  d3: wideD3,
  d4: wideD4,
  d5: wideD5,
  d6: wideD6,
  d7: wideD7,
  d8: wideD8,
  d9: wideD9,
  d10: wideD10,
  e: wideE,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const d1 = this.d1._check(input['d1'], path, 'd1', issues);
    const d2 = this.d2._check(input['d2'], path, 'd2', issues);
    const d3 = this.d3._check(input['d3'], path, 'd3', issues);
    const d4 = this.d4._check(input['d4'], path, 'd4', issues);
    const d5 = this.d5._check(input['d5'], path, 'd5', issues);
    const d6 = this.d6._check(input['d6'], path, 'd6', issues);
    const d7 = this.d7._check(input['d7'], path, 'd7', issues);
    const d8 = this.d8._check(input['d8'], path, 'd8', issues);
    const d9 = this.d9._check(input['d9'], path, 'd9', issues);
    const d10 = this.d10._check(input['d10'], path, 'd10', issues);
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
  readonly a1 = wideA1;
  readonly a2 = wideA2;
  readonly a3 = wideA3;
  readonly a4 = wideA4;
  readonly a5 = wideA5;
  readonly a6 = wideA6;
  readonly a7 = wideA7;
  readonly a8 = wideA8;
  readonly a9 = wideA9;
  readonly a10 = wideA10;
  readonly b = wideB;
  readonly d = wideD;

  get '~standard'(): StandardSchemaProps<WideInput, WideOutput> {
    return {
      version: 1,
      vendor: '@pcvl/schema',
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
      const a1 = this.a1._check(input['a1'], path, 'a1', issues);
      const a2 = this.a2._check(input['a2'], path, 'a2', issues);
      const a3 = this.a3._check(input['a3'], path, 'a3', issues);
      const a4 = this.a4._check(input['a4'], path, 'a4', issues);
      const a5 = this.a5._check(input['a5'], path, 'a5', issues);
      const a6 = this.a6._check(input['a6'], path, 'a6', issues);
      const a7 = this.a7._check(input['a7'], path, 'a7', issues);
      const a8 = this.a8._check(input['a8'], path, 'a8', issues);
      const a9 = this.a9._check(input['a9'], path, 'a9', issues);
      const a10 = this.a10._check(input['a10'], path, 'a10', issues);
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

const moneyAmount = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else {
      if (!Number.isInteger(value)) {
        issues.push({
          code: 'NOT_INTEGER',
          message: 'Number must be an integer',
          path: [...parentPath, key],
        });
      }
      if (value < 0) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'Number must be greater than or equal to 0',
          path: [...parentPath, key],
        });
      }
    }
    return value;
  },
};

const moneyCurrency = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== 'CZK' && value !== 'EUR' && value !== 'USD') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "CZK", "EUR", "USD"',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const money = {
  amount: moneyAmount,
  currency: moneyCurrency,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const amount = this.amount._check(input['amount'], path, 'amount', issues);
    const currency = this.currency._check(input['currency'], path, 'currency', issues);

    const output: Record<string, unknown> = {};
    output['amount'] = amount;
    output['currency'] = currency;
    return output;
  },
};

const contactName = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else {
      if (value.length < 1) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'String must contain at least 1 character(s)',
          path: [...parentPath, key],
        });
      }
      if (value.length > 128) {
        issues.push({
          code: 'TOO_BIG',
          message: 'String must contain at most 128 character(s)',
          path: [...parentPath, key],
        });
      }
    }
    return value;
  },
};

const contactEmail = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length < 3) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 3 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const contactPhone = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== undefined) {
      if (typeof value !== 'string') {
        issues.push({
          code: 'INVALID_TYPE',
          message: 'Expected string',
          path: [...parentPath, key],
        });
      } else if (value.length < 9) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'String must contain at least 9 character(s)',
          path: [...parentPath, key],
        });
      }
    }
    return value;
  },
};

const contact = {
  name: contactName,
  email: contactEmail,
  phone: contactPhone,
  address,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const name = this.name._check(input['name'], path, 'name', issues);
    const email = this.email._check(input['email'], path, 'email', issues);
    const phone = this.phone._check(input['phone'], path, 'phone', issues);
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

const discountCode = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length < 3) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 3 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const discountStackable = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const discount = {
  code: discountCode,
  amount: money,
  stackable: discountStackable,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const code = this.code._check(input['code'], path, 'code', issues);
    const amount = this.amount._check(input['amount'], path, 'amount', issues);
    const stackable = this.stackable._check(input['stackable'], path, 'stackable', issues);

    const output: Record<string, unknown> = {};
    output['code'] = code;
    output['amount'] = amount;
    output['stackable'] = stackable;
    return output;
  },
};

const discounts = {
  element: discount,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected array', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      output.push(this.element._check(value[index], path, index, issues));
    }
    return output;
  },
};

const attributeName = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const attributeValue = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};

const attribute = {
  name: attributeName,
  value: attributeValue,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const issueCount = issues.length;
    const input = value as Record<string, unknown>;
    const name = this.name._check(input['name'], path, 'name', issues);
    const valueOutput = this.value._check(input['value'], path, 'value', issues);

    const output: Record<string, unknown> = {};
    output['name'] = name;
    output['value'] = valueOutput;
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
  element: attribute,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected array', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      output.push(this.element._check(value[index], path, index, issues));
    }
    return output;
  },
};

const lineSku = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else {
      if (value.length < 4) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'String must contain at least 4 character(s)',
          path: [...parentPath, key],
        });
      }
      if (value.length > 32) {
        issues.push({
          code: 'TOO_BIG',
          message: 'String must contain at most 32 character(s)',
          path: [...parentPath, key],
        });
      }
    }
    return value;
  },
};

const lineQuantity = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else {
      if (!Number.isInteger(value)) {
        issues.push({
          code: 'NOT_INTEGER',
          message: 'Number must be an integer',
          path: [...parentPath, key],
        });
      }
      if (value < 1) {
        issues.push({
          code: 'TOO_SMALL',
          message: 'Number must be greater than or equal to 1',
          path: [...parentPath, key],
        });
      }
      if (value > 999) {
        issues.push({
          code: 'TOO_BIG',
          message: 'Number must be less than or equal to 999',
          path: [...parentPath, key],
        });
      }
    }
    return value;
  },
};

const lineNote = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== null && value !== undefined) {
      if (typeof value !== 'string') {
        issues.push({
          code: 'INVALID_TYPE',
          message: 'Expected string',
          path: [...parentPath, key],
        });
      } else if (value.length > 500) {
        issues.push({
          code: 'TOO_BIG',
          message: 'String must contain at most 500 character(s)',
          path: [...parentPath, key],
        });
      }
    }
    return value;
  },
};

const line = {
  sku: lineSku,
  quantity: lineQuantity,
  unitPrice: money,
  discounts,
  attributes,
  note: lineNote,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const issueCount = issues.length;
    const input = value as Record<string, unknown>;
    const sku = this.sku._check(input['sku'], path, 'sku', issues);
    const quantity = this.quantity._check(input['quantity'], path, 'quantity', issues);
    const unitPrice = this.unitPrice._check(input['unitPrice'], path, 'unitPrice', issues);
    const discountsOutput = this.discounts._check(input['discounts'], path, 'discounts', issues);
    const attributesOutput = this.attributes._check(
      input['attributes'],
      path,
      'attributes',
      issues,
    );
    const note = this.note._check(input['note'], path, 'note', issues);

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
  element: line,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected array', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const issueCount = issues.length;
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      output.push(this.element._check(value[index], path, index, issues));
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

const refundReason = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const refund = {
  amount: money,
  reason: refundReason,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const amount = this.amount._check(input['amount'], path, 'amount', issues);
    const reason = this.reason._check(input['reason'], path, 'reason', issues);

    const output: Record<string, unknown> = {};
    output['amount'] = amount;
    output['reason'] = reason;
    return output;
  },
};

const refunds = {
  element: refund,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected array', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      output.push(this.element._check(value[index], path, index, issues));
    }
    return output;
  },
};

const paymentMethod = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== 'card' && value !== 'transfer' && value !== 'cash') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "card", "transfer", "cash"',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const paymentReference = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== null && typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};

const payment = {
  method: paymentMethod,
  paid: money,
  reference: paymentReference,
  refunds,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const method = this.method._check(input['method'], path, 'method', issues);
    const paid = this.paid._check(input['paid'], path, 'paid', issues);
    const reference = this.reference._check(input['reference'], path, 'reference', issues);
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
  element: payment,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected array', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      output.push(this.element._check(value[index], path, index, issues));
    }
    return output;
  },
};

const tag = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length < 1) {
      issues.push({
        code: 'TOO_SMALL',
        message: 'String must contain at least 1 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const tags = {
  element: tag,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected array', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const issueCount = issues.length;
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      output.push(this.element._check(value[index], path, index, issues));
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

const flagsGift = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const flagsPriority = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const flagsFragile = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'boolean') {
      issues.push({
        code: 'INVALID_TYPE',
        message: 'Expected boolean',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const flags = {
  gift: flagsGift,
  priority: flagsPriority,
  fragile: flagsFragile,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const gift = this.gift._check(input['gift'], path, 'gift', issues);
    const priority = this.priority._check(input['priority'], path, 'priority', issues);
    const fragile = this.fragile._check(input['fragile'], path, 'fragile', issues);

    const output: Record<string, unknown> = {};
    output['gift'] = gift;
    output['priority'] = priority;
    output['fragile'] = fragile;
    return output;
  },
};

const metadataSource = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== 'web' && value !== 'app' && value !== 'pos') {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "web", "app", "pos"',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const metadataCampaign = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (value !== undefined && typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    }
    return value;
  },
};

const metadata = {
  source: metadataSource,
  campaign: metadataCampaign,
  flags,
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected object', path: [...parentPath, key] });
      return value;
    }
    const path = [...parentPath, key];
    const input = value as Record<string, unknown>;
    const source = this.source._check(input['source'], path, 'source', issues);
    const campaign = this.campaign._check(input['campaign'], path, 'campaign', issues);
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

const orderId = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'string') {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected string', path: [...parentPath, key] });
    } else if (value.length !== 36) {
      issues.push({
        code: 'INVALID_LENGTH',
        message: 'String must contain exactly 36 character(s)',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const orderKind = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (!Object.is(value, 'order')) {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected "order"',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const orderStatus = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (
      value !== 'new' &&
      value !== 'paid' &&
      value !== 'shipped' &&
      value !== 'delivered' &&
      value !== 'cancelled'
    ) {
      issues.push({
        code: 'INVALID_VALUE',
        message: 'Expected one of "new", "paid", "shipped", "delivered", "cancelled"',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const orderCreatedAt = {
  _check(value: unknown, parentPath: Path, key: PropertyKey, issues: Issue[]): unknown {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ code: 'INVALID_TYPE', message: 'Expected number', path: [...parentPath, key] });
    } else if (!Number.isInteger(value)) {
      issues.push({
        code: 'NOT_INTEGER',
        message: 'Number must be an integer',
        path: [...parentPath, key],
      });
    }
    return value;
  },
};

const order = {
  id: orderId,
  kind: orderKind,
  status: orderStatus,
  createdAt: orderCreatedAt,
  customer: contact,
  shippingTo: contact,
  lines,
  payments,
  total: money,
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
    const id = this.id._check(input['id'], path, 'id', issues);
    const kind = this.kind._check(input['kind'], path, 'kind', issues);
    const status = this.status._check(input['status'], path, 'status', issues);
    const createdAt = this.createdAt._check(input['createdAt'], path, 'createdAt', issues);
    const customer = this.customer._check(input['customer'], path, 'customer', issues);
    let shippingTo = input['shippingTo'];
    if (shippingTo !== undefined) {
      shippingTo = this.shippingTo._check(shippingTo, path, 'shippingTo', issues);
    }
    const linesOutput = this.lines._check(input['lines'], path, 'lines', issues);
    const paymentsOutput = this.payments._check(input['payments'], path, 'payments', issues);
    const total = this.total._check(input['total'], path, 'total', issues);
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
  readonly id = orderId;
  readonly kind = orderKind;
  readonly status = orderStatus;
  readonly createdAt = orderCreatedAt;
  readonly customer = contact;
  readonly shippingTo = contact;
  readonly lines = lines;
  readonly payments = payments;
  readonly total = money;
  readonly tags = tags;
  readonly metadata = metadata;

  get '~standard'(): StandardSchemaProps<ComplexInput, ComplexOutput> {
    return {
      version: 1,
      vendor: '@pcvl/schema',
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
      const id = this.id._check(input['id'], path, 'id', issues);
      const kind = this.kind._check(input['kind'], path, 'kind', issues);
      const status = this.status._check(input['status'], path, 'status', issues);
      const createdAt = this.createdAt._check(input['createdAt'], path, 'createdAt', issues);
      const customer = this.customer._check(input['customer'], path, 'customer', issues);
      let shippingTo = input['shippingTo'];
      if (shippingTo !== undefined) {
        shippingTo = this.shippingTo._check(shippingTo, path, 'shippingTo', issues);
      }
      const linesOutput = this.lines._check(input['lines'], path, 'lines', issues);
      const paymentsOutput = this.payments._check(input['payments'], path, 'payments', issues);
      const total = this.total._check(input['total'], path, 'total', issues);
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
      vendor: '@pcvl/schema',
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
