| Concept                    | AST representation                         | ts-morph type / method     |
| -------------------------- | ------------------------------------------ | -------------------------- |
| Source file                | Entire file                                | `SourceFile`               |
| Variable statement         | `const schema = pvl.string().min(5);`      | `VariableStatement`        |
| Variable declaration list  | `const schema = pvl.string().min(5)`       | `VariableDeclarationList`  |
| Variable declaration       | `schema = pvl.string().min(5)`             | `VariableDeclaration`      |
| Identifier (name)          | `schema`                                   | `Identifier`               |
| Initializer                | `pvl.string().min(5)`                      | `getInitializer()`         |
| Expression                 | `pvl.string().min(5)`                      | `Expression`               |
| Call expression            | `pvl.string().min(5)`                      | `CallExpression`           |
| Call expression            | `pvl.string()`                             | `CallExpression`           |
| Property access expression | `pvl.string().min`                         | `PropertyAccessExpression` |
| Property access expression | `pvl.string`                               | `PropertyAccessExpression` |
| Identifier                 | `pvl`                                      | `Identifier`               |
| Identifier                 | `string`                                   | `Identifier`               |
| Identifier                 | `min`                                      | `Identifier`               |
| Numeric literal            | `5`                                        | `NumericLiteral`           |
| Argument                   | `5` in `.min(5)`                           | `getArguments()`           |
| Variable reference         | `schema` in `const alias = schema`         | `Identifier`               |
| Function declaration       | `function validate(value: string) { ... }` | `FunctionDeclaration`      |
| Parameter                  | `value: string`                            | `ParameterDeclaration`     |
| Type reference (keyword)   | `string` in `value: string`                | `StringKeyword`            |
| Block                      | `{ return schema.validate(value); }`       | `Block`                    |
| Return statement           | `return schema.validate(value);`           | `ReturnStatement`          |
| Call expression            | `schema.validate(value)`                   | `CallExpression`           |
| Property access expression | `schema.validate`                          | `PropertyAccessExpression` |
| Argument                   | `value` in `.validate(value)`              | `Identifier`               |

## Other common AST nodes

| Concept                   | Example                               | ts-morph type             |
| ------------------------- | ------------------------------------- | ------------------------- |
| String literal            | `"hello"`                             | `StringLiteral`           |
| Boolean literal           | `true`                                | `TrueLiteral`             |
| Null literal              | `null`                                | `NullLiteral`             |
| Object literal            | `{ name: "John" }`                    | `ObjectLiteralExpression` |
| Property assignment       | `name: "John"`                        | `PropertyAssignment`      |
| Array literal             | `[1, 2, 3]`                           | `ArrayLiteralExpression`  |
| Binary expression         | `a + b`                               | `BinaryExpression`        |
| Parenthesized expression  | `(a + b)`                             | `ParenthesizedExpression` |
| As expression             | `value as string`                     | `AsExpression`            |
| Satisfies expression      | `value satisfies Type`                | `SatisfiesExpression`     |
| Arrow function            | `(x) => x * 2`                        | `ArrowFunction`           |
| New expression            | `new User()`                          | `NewExpression`           |
| Element access expression | `items[0]`                            | `ElementAccessExpression` |
| Conditional expression    | `a ? b : c`                           | `ConditionalExpression`   |
| Template expression       | `` `Hello ${name}` ``                 | `TemplateExpression`      |
| Await expression          | `await fetchData()`                   | `AwaitExpression`         |
| Import declaration        | `import { pvl } from "@pcvl/schema";` | `ImportDeclaration`       |
| Export declaration        | `export { schema };`                  | `ExportDeclaration`       |
| Class declaration         | `class User {}`                       | `ClassDeclaration`        |
| Class expression          | `class {}`                            | `ClassExpression`         |
| Interface declaration     | `interface User {}`                   | `InterfaceDeclaration`    |
| Type alias declaration    | `type ID = string;`                   | `TypeAliasDeclaration`    |
| If statement              | `if (valid) {}`                       | `IfStatement`             |
| For statement             | `for (let i = 0; i < 5; i++) {}`      | `ForStatement`            |
| Return statement          | `return value;`                       | `ReturnStatement`         |

Important: `Initializer`, `Argument`, and `Expression` are not necessarily specific syntax kinds. For example, an initializer can be a `CallExpression`, `Identifier`, `StringLiteral`, or another expression type.
