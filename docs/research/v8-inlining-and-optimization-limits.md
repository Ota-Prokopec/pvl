# V8 inlining and optimization limits, and what they mean for compiled Schemas

Checked on **2026-10-24** against **V8 13.6.233.17**, the V8 of **Node 24.21.0** (`node -p process.versions.v8`). Every source link below points at that V8 tag, with line numbers.

This note answers why one inlined `_validate` per Schema ([ADR-0023](../adr/0023-compiled-schemas-inline-nested-schemas-and-mirror-schema-methods.md)) is faster than splitting the compiled code into functions, and where that stops being true. It collects the V8 source that sets the limits, the traces that show them hitting our code, and the benchmark numbers from [`apps/benchmark`](../../apps/benchmark/AGENTS.md).

## The three variants measured

- **V1, inline everything**: what `pvl compile` emits today (ADR-0023). Each Schema compiles to one `_validate` that holds every check of the whole tree: nested objects, array loops and every key's checks are written into that one function, and nothing calls a child function.
- **V2, a function per nested object or array** (the [ADR-0017](../adr/0017-inline-with-delegation-code-generation.md) approach): primitive checks (`string`, `number`, …) stay inline in their object, but every nested object or array is its own child, held as a property of its parent, with its own `_check` that the parent calls. A Schema reused through one `const` (like `address`) is one child called from every place.
- **V3, a function per key**: every key, primitives included, and every array element is its own child with its own `_check`. A parent only calls its children.

In V2 and V3 a child pushes into the parent's `issues` and returns its output, and builds its path only where V1 does, so the split into functions is the only difference from V1. All three return deep-equal Results for every benchmark input.

## The limits

Three different functions are involved when V8 inlines, and each limit measures a different one:

- **The function being optimized**: the one TurboFan compiles, the outermost caller, such as `_validate`. Everything is inlined into it, so it is the function the code is inlined into.
- **The function being inlined**: the callee at one call site, whose body V8 would copy into the function being optimized, such as a `_check` that `_validate` calls.
- **Nested callees**: a call inside an already-inlined callee, such as a per-key `_check` called from an inlined per-object `_check`. It becomes a candidate of the same function being optimized and counts against the same budget. The budget belongs to the function being optimized, not to each caller in between.

| Flag                                   | Default        | Which function it measures                                                                                                                                                                                                            | Defined in                                                                                                           |
| -------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `max_inlined_bytecode_size`            | 460 bytes      | **The function being inlined**, its own bytecode only, not counting anything it calls. If it is bigger, it is never inlined anywhere.                                                                                                 | [flag-definitions.h L1356–L1357](https://github.com/v8/v8/blob/13.6.233.17/src/flags/flag-definitions.h#L1356-L1357) |
| `max_inlined_bytecode_size_cumulative` | 920 bytes      | **The function being optimized**: the total bytecode already inlined into it, nested callees included, but not its own bytecode. The budget each candidate must still fit in.                                                         | [flag-definitions.h L1358–L1359](https://github.com/v8/v8/blob/13.6.233.17/src/flags/flag-definitions.h#L1358-L1359) |
| `max_inlined_bytecode_size_absolute`   | 4,600 bytes    | **The function being optimized**: the same total. Once it reaches 4,600, V8 stops looking at its call sites at all, even small ones.                                                                                                  | [flag-definitions.h L1360–L1361](https://github.com/v8/v8/blob/13.6.233.17/src/flags/flag-definitions.h#L1360-L1361) |
| `reserve_inline_budget_scale_factor`   | 1.2            | **The function being inlined**: its size counts 1.2× when checked against the 920 budget.                                                                                                                                             | [flag-definitions.h L1362–L1364](https://github.com/v8/v8/blob/13.6.233.17/src/flags/flag-definitions.h#L1362-L1364) |
| `max_inlined_bytecode_size_small`      | 27 bytes       | **The function being inlined**, counted with what it already inlined itself. If it is this small, it is inlined at once and the 920 budget is never checked for it.                                                                   | [flag-definitions.h L1365–L1366](https://github.com/v8/v8/blob/13.6.233.17/src/flags/flag-definitions.h#L1365-L1366) |
| `max_optimized_bytecode_size`          | 61,440 (60 KB) | **The function being optimized**, its own bytecode. It has nothing to do with inlining: if the function is bigger, TurboFan never compiles it, though Maglev still can ([section 4](#4-the-optimization-limit-functions-over-60-kb)). | [flag-definitions.h L1367–L1370](https://github.com/v8/v8/blob/13.6.233.17/src/flags/flag-definitions.h#L1367-L1370) |

**What "size" means for a function being inlined.** The 460-byte check reads only the callee's own bytecode length ([shared-function-info-inl.h L335–L338](https://github.com/v8/v8/blob/13.6.233.17/src/objects/shared-function-info-inl.h#L335-L338)). The budget checks use the candidate's `total_size`. That is the callee's bytecode plus whatever bytecode the callee's own optimized code had already inlined, if it was optimized on its own before ([js-inlining-heuristic.cc L225–L237](https://github.com/v8/v8/blob/13.6.233.17/src/compiler/js-inlining-heuristic.cc#L225-L237)). `--trace-turbo-inlining` prints it as `bytecode size: 86, existing opt code's inlined bytecode size: 144`.

**What the budget counts.** The running total starts at 0 for each function being optimized ([js-inlining-heuristic.h L129](https://github.com/v8/v8/blob/13.6.233.17/src/compiler/js-inlining-heuristic.h#L129)). Each successful inlining adds the callee's own bytecode length ([js-inlining-heuristic.cc L711–L715](https://github.com/v8/v8/blob/13.6.233.17/src/compiler/js-inlining-heuristic.cc#L711-L715)).

**Worked example**, V3 `flat` from [section 3](#3-why-v1-is-faster-and-whether-v3-could-match-it). TurboFan optimizes `_validate`, the function being optimized, which calls 10 per-key `_check`s, the functions being inlined.

1. Each `_check` is under 460 bytes, so each one may be inlined.
2. They go in smallest first, and the total inlined into `_validate` grows to 769 bytes.
3. The last `_check` is 202 bytes, and with the 1.2 factor it counts as about 242. `769 + 242 = 1,011` is over 920, so it stays a real call.
4. `_validate`'s own bytecode never counts toward the 920. It only matters for the 60 KB limit.

`node --v8-options` prints the same flags with their defaults. Sizes are of a function's **bytecode**, not its source text; `node --print-bytecode --print-bytecode-filter=<name>` prints a function's `Bytecode length`.

## 1. Where it is written

No official V8 page states the inlining rules in prose. They are written in V8's source, quoted here.

**A function over 460 bytes can't be inlined.** [src/objects/shared-function-info-inl.h L335–L338](https://github.com/v8/v8/blob/13.6.233.17/src/objects/shared-function-info-inl.h#L335-L338):

```cpp
if (GetBytecodeArray(isolate)->length() >
    v8_flags.max_inlined_bytecode_size) {
  return kExceedsBytecodeLimit;
}
```

[src/compiler/js-inlining-heuristic.cc L66](https://github.com/v8/v8/blob/13.6.233.17/src/compiler/js-inlining-heuristic.cc#L66) then refuses any candidate that isn't `kIsInlineable`. The trace flag `--trace-turbo-inlining` prints the refusal as a number: `Cannot consider … _check for inlining (reason: 5)`. The number indexes the `Inlineability` enum at [src/objects/shared-function-info.h L661–L673](https://github.com/v8/v8/blob/13.6.233.17/src/objects/shared-function-info.h#L661-L673), counted from 0: `kHasNoScript`, `kNeedsBinaryCoverage`, `kIsBuiltin`, `kIsNotUserCode`, `kHasNoBytecode`, **`kExceedsBytecodeLimit` (5)**, `kMayContainBreakPoints`, `kHasOptimizationDisabled`, `kIsInlineable`.

**Inlining shares one budget per optimized function.** [src/compiler/js-inlining-heuristic.cc L283–L306](https://github.com/v8/v8/blob/13.6.233.17/src/compiler/js-inlining-heuristic.cc#L283-L306):

```cpp
// We inline at most one candidate in every iteration of the fixpoint.
// This is to ensure that we don't consume the full inlining budget
// on things that aren't called very often.
// ...
// Make sure we have some extra budget left, so that any small functions
// exposed by this function would be given a chance to inline.
double size_of_candidate =
    candidate.total_size * v8_flags.reserve_inline_budget_scale_factor;
int total_size =
    total_inlined_bytecode_size_ + static_cast<int>(size_of_candidate);
if (total_size > max_inlined_bytecode_size_cumulative_) {
  info_->set_could_not_inline_all_candidates();
  // Try if any smaller functions are available to inline.
  continue;
}
```

Candidates are tried best score first, where the score is call frequency divided by size ([L814](https://github.com/v8/v8/blob/13.6.233.17/src/compiler/js-inlining-heuristic.cc#L814)). So among calls that run equally often, the smallest functions go in first. Inlining stops outright at the absolute limit ([L166](https://github.com/v8/v8/blob/13.6.233.17/src/compiler/js-inlining-heuristic.cc#L166)). Functions of 27 bytes or less are always inlined, outside the budget ([L26](https://github.com/v8/v8/blob/13.6.233.17/src/compiler/js-inlining-heuristic.cc#L26), [L266](https://github.com/v8/v8/blob/13.6.233.17/src/compiler/js-inlining-heuristic.cc#L266)).

**A function over 60 KB is never optimized by TurboFan.** That limit has a section of its own: [section 4](#4-the-optimization-limit-functions-over-60-kb).

## 2. Why V8 limits inlining

V8 states only one reason, in the comment quoted above: inline one candidate at a time "to ensure that we don't consume the full inlining budget on things that aren't called very often". The `max_optimized_bytecode_size` flag adds that "too high values may cause the compiler to hit (release) assertions". It doesn't explain the numbers themselves.

The rest is the usual compiler trade-off. This is our explanation, not V8's own words:

- **Inlining copies code.** A function inlined into 5 callers exists 5 times: more machine code, and more deoptimization data V8 keeps to fall back to slow code.
- **Optimizing takes longer.** TurboFan optimizes while the program runs, and its time grows faster than the function's size, so a big merged function holds up everything waiting for it.
- **There is less to gain from a big function.** A call costs a few nanoseconds no matter how big the function is. For a large function that is a small share of the time it already takes.
- **Bigger merged functions fail together.** If any inlined part meets a value V8 didn't expect, the whole merged function deoptimizes and has to be optimized again.

## 3. Why V1 is faster, and whether V3 could match it

V1 has no calls. V2 and V3 only match it when V8 inlines their child functions back into the caller, and the limits above decide when it does.

**`list` (an array of 1,000 objects).** From `--trace-turbo-inlining` and `--print-bytecode`:

| Variant | Per-item function                                       | V8's decision                                                     | Time vs V1 |
| ------- | ------------------------------------------------------- | ----------------------------------------------------------------- | ---------- |
| V1      | none: the loop body is in `_validate` (676 bytes)       | nothing to inline                                                 | baseline   |
| V2      | `listItem._check`, **518 bytes**                        | over 460: `Cannot consider _check for inlining (reason: 5)`       | **+31 %**  |
| V3      | the item function is 158 bytes, each per-key one 45–235 | all inlined: `Inlining _check into _validate`, 638 bytes in total | +9 %       |

So V2 makes 1,000 real calls per validation and V3 makes none, which is why V3 beats V2 here. Even fully inlined, V3 stays 9 % slower: some cost remains, probably reading `this.<key>` and passing the extra arguments.

**`flat` (10 primitive keys) in V3.** The 10 per-key functions are 45, 49, 59, 60, 65, 95, 95, 143, 158 and 202 bytes. V8 inlined the 9 smallest, 769 bytes in total. The 10th would count as 202 × 1.2 ≈ 242, and 769 + 242 = 1,011 is over the 920 budget, so V8 skipped it and the call stays real. That call is the main suspect for V3 `flat` being 44 % slower than V1, though it wasn't isolated.

**Could V3 be as fast as V1?** Only for small Schemas. A single per-key function rarely passes 460 bytes; one would need many constraints, or an enum of roughly 60 or more values (an estimate, not measured). What stops V3 is the shared budget: everything inlined into one optimized function has to fit in about 920 bytes, roughly 10 simple keys. Anything wider or deeper keeps real calls. The 27-byte always-inline exception doesn't help either, since a single `issues.push({...})` is already bigger.

**V1's own limit is 60 KB.** V1 has nothing to inline, so the inlining budgets don't apply to it. It is limited only by `max_optimized_bytecode_size` ([section 4](#4-the-optimization-limit-functions-over-60-kb)). V1's `complex` `_validate` is 14,748 bytes, about a quarter of it.

## 4. The optimization limit: functions over 60 KB

V8 runs a function through tiers: Ignition, the interpreter; Sparkplug, a baseline compiler that doesn't optimize; Maglev, a fast optimizing compiler; and TurboFan, the top optimizing compiler. The V8 blog's [Maglev post](https://v8.dev/blog/maglev) (5 December 2023) introduces the last three and says "Maglev sits between our existing Sparkplug and TurboFan compilers, and fills the role of a fast optimizing compiler". A hot function moves up the tiers, and TurboFan's code is the fastest.

**The limit is a flag**, [src/flags/flag-definitions.h L1367–L1370](https://github.com/v8/v8/blob/13.6.233.17/src/flags/flag-definitions.h#L1367-L1370):

```cpp
DEFINE_INT(max_optimized_bytecode_size, 60 * KB,
           "maximum bytecode size to "
           "be considered for turbofan optimization; too high values may cause "
           "the compiler to hit (release) assertions")
```

`60 * KB` is 61,440 bytes of bytecode. The flag's own text says it is about TurboFan, and V8 enforces it in three places.

**1. The tier-up decision.** [src/execution/tiering-manager.cc L386–L425](https://github.com/v8/v8/blob/13.6.233.17/src/execution/tiering-manager.cc#L386-L425), `TieringManager::ShouldOptimize`, shortened:

```cpp
OptimizationDecision TieringManager::ShouldOptimize(
    Tagged<FeedbackVector> feedback_vector, CodeKind current_code_kind) {
  // ...
  if (TiersUpToMaglev(current_code_kind) &&
      shared->PassesFilter(v8_flags.maglev_filter) &&
      !shared->maglev_compilation_failed()) {
    // ...
    return OptimizationDecision::Maglev();
  }
  // ...
  Tagged<BytecodeArray> bytecode = shared->GetBytecodeArray(isolate_);
  if (bytecode->length() > v8_flags.max_optimized_bytecode_size) {
    return OptimizationDecision::DoNotOptimize();
  }

  return OptimizationDecision::TurbofanHotAndStable();
}
```

The Maglev branch returns before the size check, so **Maglev has no size limit**. Only the step from Maglev up to TurboFan checks the size, and a function over 60 KB stays on Maglev for good.

**2. How often V8 checks.** V8 decides whether to tier a function up when the function's interrupt budget runs out. Over the limit, the budget becomes huge, so V8 checks far less often. [src/execution/tiering-manager.cc L240–L245](https://github.com/v8/v8/blob/13.6.233.17/src/execution/tiering-manager.cc#L240-L245):

```cpp
if (bytecode_length > v8_flags.max_optimized_bytecode_size) {
  // Decrease times of interrupt budget underflow, the reason of not setting
  // to INT_MAX is the interrupt budget may overflow when doing add
  // operation for forward jump.
  return INT_MAX / 2;
}
```

**3. TurboFan itself refuses.** If such a function reaches TurboFan anyway, the pipeline aborts. [src/compiler/pipeline.cc L699–L702](https://github.com/v8/v8/blob/13.6.233.17/src/compiler/pipeline.cc#L699-L702):

```cpp
if (compilation_info()->bytecode_array()->length() >
    v8_flags.max_optimized_bytecode_size) {
  return AbortOptimization(BailoutReason::kFunctionTooBig);
}
```

The reason's message is "Function is too big to be optimized" ([src/codegen/bailout-reason.h L129](https://github.com/v8/v8/blob/13.6.233.17/src/codegen/bailout-reason.h#L129)).

**Maglev's limits are on inlining only.** [src/flags/flag-definitions.h L619–L637](https://github.com/v8/v8/blob/13.6.233.17/src/flags/flag-definitions.h#L619-L637) gives Maglev the same 460 / 920 / 27-byte inlining limits as TurboFan. But while TurboFan is enabled, as it is by default, weak implications lower them to inlining only functions of 100 bytes or less, one level deep:

```cpp
DEFINE_WEAK_VALUE_IMPLICATION(turbofan, max_maglev_inline_depth, 1)
DEFINE_WEAK_VALUE_IMPLICATION(turbofan, max_maglev_inlined_bytecode_size, 100)
```

So Maglev compiles a function of any size, but inlines little into it.

**What it means for V1.** The traces of the `huge` Schema below show exactly this. Its 95,845-byte `_validate` is marked for Maglev (`[marking … <JSFunction _validate> for optimization to MAGLEV, … reason: hot and stable]`), compiled by it, and never marked for TurboFan. For scale, V1's `_validate` is 676 bytes for `list`, 14,748 for `complex` and 95,845 for `huge`, so a Schema about four times the size of `complex` crosses the limit.

## Benchmark results

All times are the median time per validation. Each case × variant ran 10 times, each in a fresh `node` process, in shuffled order, and the value is the median across the 10 runs. The fastest and slowest run are in brackets, and percentages are against V1. A version "wins" a case only if the next best is more than 5 % slower.

| Case              | V1 inline     | V2 per-composite       | V3 per-key              | Winner    |
| ----------------- | ------------- | ---------------------- | ----------------------- | --------- |
| flat (valid)      | 0.00001896 ms | 0.00001888 ms (-0.5 %) | 0.00002725 ms (+43.7 %) | tie V1/V2 |
| flat (invalid)    | 0.0001450 ms  | 0.0001457 ms (+0.5 %)  | 0.0001570 ms (+8.3 %)   | tie V1/V2 |
| nested (valid)    | 0.0001046 ms  | 0.0001077 ms (+3.0 %)  | 0.0001028 ms (-1.6 %)   | tie       |
| nested (invalid)  | 0.0001591 ms  | 0.0001681 ms (+5.6 %)  | 0.0001703 ms (+7.0 %)   | **V1**    |
| list (valid)      | 0.02187 ms    | 0.02900 ms (+32.6 %)   | 0.02390 ms (+9.2 %)     | **V1**    |
| list (invalid)    | 0.02242 ms    | 0.02927 ms (+30.6 %)   | 0.02446 ms (+9.1 %)     | **V1**    |
| reused (valid)    | 0.0001057 ms  | 0.0001242 ms (+17.4 %) | 0.0001295 ms (+22.5 %)  | **V1**    |
| reused (invalid)  | 0.0002211 ms  | 0.0002419 ms (+9.4 %)  | 0.0002492 ms (+12.7 %)  | **V1**    |
| wide (valid)      | 0.0001457 ms  | 0.0001611 ms (+10.5 %) | 0.0001774 ms (+21.7 %)  | **V1**    |
| wide (invalid)    | 0.0002684 ms  | 0.0002742 ms (+2.2 %)  | 0.0002915 ms (+8.6 %)   | tie V1/V2 |
| complex (valid)   | 0.01873 ms    | 0.01906 ms (+1.8 %)    | 0.01977 ms (+5.6 %)     | tie V1/V2 |
| complex (invalid) | 0.01908 ms    | 0.01919 ms (+0.5 %)    | 0.01969 ms (+3.2 %)     | tie       |

V1 won 6 of 12 cases and tied the rest; V2 and V3 won none. By the 5 % rule chosen before measuring (V2 within 5 % of V1 on every case would reopen ADR-0023), ADR-0023 holds.

**Output size** (each module transpiled to JavaScript): V2 is 34 % smaller than V1 (38 % gzipped) and imports about 13 % faster from cold. V3 is 18 % smaller.

### Past the 60 KB limit: the `huge` Schema

`huge` is the `complex` order repeated 6 times under keys `o1`–`o6`. All three variants return identical Results, including 10 Issues on the invalid input.

| Function                   | Bytecode                                 |
| -------------------------- | ---------------------------------------- |
| V1 `_validate`             | **95,845 bytes**, 1.56× the 61,440 limit |
| V2 and V3 root `_validate` | 335 bytes each                           |
| V2 largest `_check`s       | 1,117, 976, 508, 484, 476, 469 bytes     |
| V3 largest `_check`s       | 874, 600, 433 bytes                      |

| Case           | V1 inline               | V2 per-composite                      | V3 per-key                            |
| -------------- | ----------------------- | ------------------------------------- | ------------------------------------- |
| huge (valid)   | 0.1747 ms [0.172–0.181] | 0.1187 ms (**-32.1 %**) [0.117–0.125] | 0.1221 ms (**-30.1 %**) [0.120–0.129] |
| huge (invalid) | 0.1758 ms [0.174–0.187] | 0.1186 ms (**-32.5 %**) [0.118–0.120] | 0.1212 ms (**-31.1 %**) [0.120–0.126] |

The other way round, V1 takes 47 % longer than V2. From `--trace-opt`:

- **V1 is never optimized by TurboFan.** V8 never even marks it for TurboFan. It only gets Maglev, V8's mid-tier optimizer: `[marking … <JSFunction _validate> for optimization to MAGLEV, … reason: hot and stable]`. Maglev has no size limit ([section 4](#4-the-optimization-limit-functions-over-60-kb)), so it compiled the 95 KB function anyway. That's why V1 is "only" 47 % slower and not several times slower.
- **V2 and V3 put the work in small functions that do reach TurboFan** (`[completed optimizing … <JSFunction _check> (target TURBOFAN_JS)]`, 14× for V2 and 16× for V3). Their root only reached Maglev too, but it only makes 6 calls.
- The 460-byte limit still applies: `Cannot consider … _check for inlining (reason: 5)` appears 20× for V2 and 10× for V3.

Output size grew by 294 KB raw for V1 (to 395 KB, 40 KB gzipped) and by only about 5–6 KB for V2 and V3.

### Startup cost against cost per call

A bigger V1 module costs time once per process. In a long-running process, such as a backend server, that cost is paid at startup and later requests don't pay it again. One cost does stay for every call.

**Paid once, at startup:**

- **Parsing the module.** In the quick run it took about 3 ms for V1 against 1.6 ms for V2.
- **Generating bytecode.** V8 compiles each `_validate` to bytecode on its first call. The first validation of every Schema took about 8 ms for V1 against 3 ms for V2.
- **Warm-up.** The first calls run unoptimized code until V8 finds the function hot and optimizes it.

After warm-up, a call's speed depends on how well V8 optimized the function, not on the file's size.

**Paid on every call:** a single function over 60 KB of bytecode never reaches TurboFan and stays on Maglev for good ([section 4](#4-the-optimization-limit-functions-over-60-kb)). That is the `huge` case above: V1 is slower on every hot call, not only the first. Strictly, what matters is the size of that one function, not of the file, but in V1 they grow together.

**Smaller effects:**

- **Memory.** The bytecode and optimized code stay in memory for the life of the process. It is a fixed cost, and small for a server.
- **Bytecode flushing.** V8 can drop the bytecode of a function that hasn't run for a while (`--flush-bytecode`, on by default), and regenerates it on the next call. A rarely used Schema can then pay a little of the startup cost again. A Schema in regular use isn't flushed.

**Where startup does matter:** environments that start often, such as serverless cold starts, CLIs and test runs, and browsers, which also download the bigger file.

## What it means for the compiler

- V1 wins up to about the size of `complex`, about a quarter of the 60 KB limit. Past the limit it loses by about a third.
- V2 and V3 lose wherever a child is called many times and isn't inlined: one too big (over 460 bytes) or past the shared budget (920 bytes).
- **A hybrid keeps both wins**: inline everything, and split a child into its own function only when the compiled `_validate` would get close to `max_optimized_bytecode_size`.
- **V1 also starts slower.** In the quick run (`pnpm --filter benchmark bench`, one module holding every Schema, `huge` included), V1 took about 3 ms instead of V2's 1.6 ms to import the module, and about 8 ms instead of 3 ms for the first validation of every Schema, because there is more code to parse. That cost is paid once per process, so it doesn't change the recommendation. The hybrid would shrink it for big Schemas too, since splitting a Schema that is reused emits its code once instead of once per use.

## Reproducing

The benchmark is the [`apps/benchmark`](../../apps/benchmark/AGENTS.md) app. Build the packages first (`pnpm build`).

- `pnpm --filter benchmark bench` is the quick run. It checks the variants agree, then prints module size, cold start and hot time per call. It measures everything in one process, so its hot timings are noisy: they moved by up to 30 % between runs.
- `pnpm --filter benchmark bench:isolated` produced the 10-round tables above: one fresh process per measurement, in shuffled order. Narrow it with `-- --rounds 3 --schemas list,huge`.
- Inlining decisions: `node --trace-turbo-inlining --import tsx <script>`. Look for `Inlining … into …` and `Cannot consider … (reason: N)`.
- Optimization tiers: `node --trace-opt --trace-deopt …`. Look for `target MAGLEV` and `target TURBOFAN_JS`.
- Bytecode sizes: `node --print-bytecode --print-bytecode-filter=_validate …`. Look for `Bytecode length`.
