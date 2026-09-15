import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

type Queryable = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

const BACKTICK = String.fromCharCode(96);

function identifier(value: string) {
  const trimmed = value.trim();
  const unquoted =
    trimmed.startsWith(BACKTICK) && trimmed.endsWith(BACKTICK)
      ? trimmed.slice(1, -1).split(BACKTICK + BACKTICK).join(BACKTICK)
      : trimmed;
  if (!/^[A-Za-z0-9_]+$/.test(unquoted)) {
    throw new Error("Unsafe identifier in versioned migration: " + value);
  }
  return unquoted;
}

function quoted(value: string) {
  return BACKTICK + identifier(value) + BACKTICK;
}

function firstIdentifier(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith(BACKTICK)) {
    const end = trimmed.indexOf(BACKTICK, 1);
    if (end < 0) throw new Error("Unterminated identifier: " + value);
    return identifier(trimmed.slice(0, end + 1));
  }
  const match = /^[A-Za-z0-9_]+/.exec(trimmed);
  if (!match) throw new Error("Expected identifier: " + value);
  return identifier(match[0]);
}

export function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let current = "";
  let quote: "'" | '"' | null | string = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1] ?? "";
    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        current += "\n";
      }
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      current += char;
      if (char === "\\" && quote !== BACKTICK && next) {
        current += next;
        index += 1;
      } else if (char === quote) {
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
    } else if (char === "#") {
      lineComment = true;
    } else if (char === "-" && next === "-" && /\s|$/.test(sql[index + 2] ?? "")) {
      lineComment = true;
      index += 1;
    } else if (char === "'" || char === '"' || char === BACKTICK) {
      quote = char;
      current += char;
    } else if (char === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
    } else {
      current += char;
    }
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  if (quote || blockComment) throw new Error("Unterminated SQL quote/comment");
  return statements;
}

export function splitTopLevel(value: string) {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1] ?? "";
    if (quote) {
      current += char;
      if (char === "\\" && quote !== BACKTICK && next) {
        current += next;
        index += 1;
      } else if (char === quote) {
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
    } else if (char === "'" || char === '"' || char === BACKTICK) {
      quote = char;
      current += char;
    } else if (char === "(") {
      depth += 1;
      current += char;
    } else if (char === ")") {
      depth -= 1;
      current += char;
    } else if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  if (depth !== 0 || quote) throw new Error("Unbalanced SQL clause");
  return parts;
}

function matchingParen(value: string, openIndex: number) {
  let depth = 0;
  let quote: string | null = null;
  for (let index = openIndex; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1] ?? "";
    if (quote) {
      if (char === "\\" && quote !== BACKTICK) index += 1;
      else if (char === quote) {
        if (next === quote) index += 1;
        else quote = null;
      }
    } else if (char === "'" || char === '"' || char === BACKTICK) {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Unbalanced parenthesis");
}

class Reconciler {
  constructor(private readonly db: Queryable) {}

  private async count(sql: string, ...values: unknown[]) {
    const rows = await this.db.$queryRawUnsafe<Array<{ count: bigint | number }>>(sql, ...values);
    return Number(rows[0]?.count ?? 0);
  }

  private async tableExists(table: string) {
    return (await this.count(
      "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?",
      table,
    )) > 0;
  }

  private async columnExists(table: string, column: string) {
    return (await this.count(
      "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?",
      table,
      column,
    )) > 0;
  }

  private async indexRows(table: string, indexName: string) {
    return this.db.$queryRawUnsafe<Array<{ columnName: string; nonUnique: bigint | number }>>(
      "SELECT column_name AS columnName, non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? ORDER BY seq_in_index",
      table,
      indexName,
    );
  }

  private async constraintExists(table: string, name: string) {
    return (await this.count(
      "SELECT COUNT(*) AS count FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name=? AND constraint_name=?",
      table,
      name,
    )) > 0;
  }

  private indexColumns(definition: string) {
    const open = definition.indexOf("(");
    if (open < 0) throw new Error("Missing index columns: " + definition);
    const close = matchingParen(definition, open);
    return splitTopLevel(definition.slice(open + 1, close)).map(firstIdentifier);
  }

  private async ensureIndex(table: string, definition: string, addPrefix: boolean) {
    const match = /^(?:ADD\s+)?(UNIQUE\s+)?(?:INDEX|KEY)\s+([^\s(]+)/i.exec(definition);
    if (!match) throw new Error("Unsupported index: " + definition);
    const unique = Boolean(match[1]);
    const name = identifier(match[2]);
    const expectedColumns = this.indexColumns(definition);
    const current = await this.indexRows(table, name);
    if (current.length) {
      const currentColumns = current.map((row) => row.columnName);
      const currentUnique = Number(current[0].nonUnique) === 0;
      if (currentColumns.join(",") !== expectedColumns.join(",") || (unique && !currentUnique)) {
        throw new Error("Existing index differs from migration: " + table + "." + name);
      }
      console.log("      already exists: index " + table + "." + name);
      return;
    }
    const clause = addPrefix && !/^ADD\s+/i.test(definition) ? "ADD " + definition : definition;
    await this.db.$executeRawUnsafe("ALTER TABLE " + quoted(table) + " " + clause);
  }

  private async ensurePrimary(table: string, definition: string) {
    const expected = this.indexColumns(definition);
    const current = await this.indexRows(table, "PRIMARY");
    if (current.length) {
      if (current.map((row) => row.columnName).join(",") !== expected.join(",")) {
        throw new Error("Existing primary key differs from migration: " + table);
      }
      return;
    }
    const clause = /^ADD\s+/i.test(definition) ? definition : "ADD " + definition;
    await this.db.$executeRawUnsafe("ALTER TABLE " + quoted(table) + " " + clause);
  }

  private async ensureConstraint(table: string, definition: string) {
    const match = /^(?:ADD\s+)?CONSTRAINT\s+([^\s]+)/i.exec(definition);
    if (!match) throw new Error("Unsupported constraint: " + definition);
    const name = identifier(match[1]);
    if (await this.constraintExists(table, name)) {
      console.log("      already exists: constraint " + table + "." + name);
      return;
    }
    const clause = /^ADD\s+/i.test(definition) ? definition : "ADD " + definition;
    await this.db.$executeRawUnsafe("ALTER TABLE " + quoted(table) + " " + clause);
  }

  private async alterClause(table: string, clause: string) {
    let match = /^ADD\s+(?:COLUMN\s+)?([^\s(]+)/i.exec(clause);
    if (match && !/^ADD\s+(?:UNIQUE\s+)?(?:INDEX|KEY|CONSTRAINT|PRIMARY)\b/i.test(clause)) {
      const column = identifier(match[1]);
      if (await this.columnExists(table, column)) {
        console.log("      already exists: column " + table + "." + column);
        return;
      }
      await this.db.$executeRawUnsafe("ALTER TABLE " + quoted(table) + " " + clause);
      return;
    }

    match = /^DROP\s+(?:COLUMN\s+)?([^\s(]+)/i.exec(clause);
    if (match && !/^DROP\s+(?:INDEX|KEY|FOREIGN|PRIMARY)\b/i.test(clause)) {
      const column = identifier(match[1]);
      if (!(await this.columnExists(table, column))) {
        console.log("      already absent: column " + table + "." + column);
        return;
      }
      await this.db.$executeRawUnsafe("ALTER TABLE " + quoted(table) + " " + clause);
      return;
    }

    if (/^ADD\s+(?:UNIQUE\s+)?(?:INDEX|KEY)\b/i.test(clause)) {
      await this.ensureIndex(table, clause, false);
      return;
    }
    if (/^ADD\s+PRIMARY\s+KEY\b/i.test(clause)) {
      await this.ensurePrimary(table, clause);
      return;
    }
    if (/^ADD\s+CONSTRAINT\b/i.test(clause)) {
      await this.ensureConstraint(table, clause);
      return;
    }

    match = /^DROP\s+(?:INDEX|KEY)\s+([^\s]+)/i.exec(clause);
    if (match) {
      const indexName = identifier(match[1]);
      if (!(await this.indexRows(table, indexName)).length) return;
      await this.db.$executeRawUnsafe("ALTER TABLE " + quoted(table) + " " + clause);
      return;
    }

    match = /^DROP\s+FOREIGN\s+KEY\s+([^\s]+)/i.exec(clause);
    if (match) {
      const name = identifier(match[1]);
      if (!(await this.constraintExists(table, name))) return;
      await this.db.$executeRawUnsafe("ALTER TABLE " + quoted(table) + " " + clause);
      return;
    }

    if (/^DROP\s+PRIMARY\s+KEY\b/i.test(clause)) {
      if (!(await this.indexRows(table, "PRIMARY")).length) return;
      await this.db.$executeRawUnsafe("ALTER TABLE " + quoted(table) + " " + clause);
      return;
    }

    await this.db.$executeRawUnsafe("ALTER TABLE " + quoted(table) + " " + clause);
  }

  private async alterTable(statement: string) {
    const match = /^ALTER\s+TABLE\s+([^\s]+)\s+([\s\S]+)$/i.exec(statement);
    if (!match) throw new Error("Unsupported ALTER TABLE: " + statement);
    const table = identifier(match[1]);
    if (!(await this.tableExists(table))) throw new Error("Missing ALTER TABLE target: " + table);
    for (const clause of splitTopLevel(match[2])) await this.alterClause(table, clause);
  }

  private async createTable(statement: string) {
    const match = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i.exec(statement);
    if (!match) throw new Error("Unsupported CREATE TABLE: " + statement);
    const table = identifier(match[1]);
    if (!(await this.tableExists(table))) {
      await this.db.$executeRawUnsafe(statement);
      return;
    }

    console.log("      already exists: table " + table);
    const open = statement.indexOf("(", match.index + match[0].length);
    if (open < 0) throw new Error("CREATE TABLE has no body: " + table);
    const close = matchingParen(statement, open);
    const definitions = splitTopLevel(statement.slice(open + 1, close));
    for (const definition of definitions) {
      if (!definition.trim().startsWith(BACKTICK)) continue;
      const column = firstIdentifier(definition);
      if (!(await this.columnExists(table, column))) {
        await this.db.$executeRawUnsafe("ALTER TABLE " + quoted(table) + " ADD COLUMN " + definition);
      }
    }
    for (const definition of definitions) {
      if (/^PRIMARY\s+KEY\b/i.test(definition)) await this.ensurePrimary(table, definition);
      else if (/^(?:UNIQUE\s+)?(?:INDEX|KEY)\b/i.test(definition)) {
        await this.ensureIndex(table, definition, true);
      } else if (/^CONSTRAINT\b/i.test(definition)) {
        await this.ensureConstraint(table, definition);
      }
    }
  }

  private async createIndex(statement: string) {
    const match = /^CREATE\s+(UNIQUE\s+)?INDEX\s+([^\s]+)\s+ON\s+([^\s(]+)\s*(\([\s\S]+)$/i.exec(statement);
    if (!match) throw new Error("Unsupported CREATE INDEX: " + statement);
    await this.ensureIndex(identifier(match[3]), (match[1] ?? "") + "INDEX " + match[2] + " " + match[4], true);
  }

  private async dropIndex(statement: string) {
    const match = /^DROP\s+INDEX\s+([^\s]+)\s+ON\s+([^\s]+)/i.exec(statement);
    if (!match) throw new Error("Unsupported DROP INDEX: " + statement);
    const indexName = identifier(match[1]);
    const table = identifier(match[2]);
    if (!(await this.indexRows(table, indexName)).length) return;
    await this.db.$executeRawUnsafe(statement);
  }

  async apply(sql: string) {
    const statements = splitSqlStatements(sql);
    if (!statements.length) throw new Error("Migration SQL is empty");
    for (const [index, statement] of statements.entries()) {
      console.log(
        "      statement " + (index + 1) + "/" + statements.length + ": " +
          statement.replace(/\s+/g, " ").slice(0, 100),
      );
      if (/^ALTER\s+TABLE\b/i.test(statement)) await this.alterTable(statement);
      else if (/^CREATE\s+TABLE\b/i.test(statement)) await this.createTable(statement);
      else if (/^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(statement)) await this.createIndex(statement);
      else if (/^DROP\s+INDEX\b/i.test(statement)) await this.dropIndex(statement);
      else if (/^(?:SET\s+@|PREPARE\b|EXECUTE\b|DEALLOCATE\s+PREPARE\b)/i.test(statement)) {
        throw new Error("Session-scoped PREPARE SQL must remain self-idempotent");
      } else if (
        /^INSERT\s+INTO\s+[`]?inv_supplier_phones[`]?\b/i.test(statement) &&
        /\bFROM\s+[`]?inv_suppliers[`]?\b/i.test(statement) &&
        !(await this.columnExists("inv_suppliers", "phone"))
      ) {
        // This backfill precedes DROP inv_suppliers.phone in the same migration.
        // A missing source column proves the legacy step already advanced past it.
        console.log("      legacy supplier phone source already removed; backfill already completed");
      } else {
        await this.db.$executeRawUnsafe(statement);
      }
    }
  }
}

function selfTest() {
  const statements = splitSqlStatements(
    "-- comment\nALTER TABLE demo ADD COLUMN kind ENUM('a','b'), ADD INDEX kind_idx (kind);" +
      "INSERT INTO demo (kind) VALUES ('a;one-string');",
  );
  assert.equal(statements.length, 2);
  const alter = /^ALTER\s+TABLE\s+demo\s+([\s\S]+)$/i.exec(statements[0]);
  assert.ok(alter);
  assert.equal(splitTopLevel(alter[1]).length, 2);
  assert.equal(splitTopLevel("ADD INDEX x (a, b)").length, 1);
  console.log("reconcile-failed-migration self-test passed");
}

async function main() {
  if (process.argv[2] === "--self-test") {
    selfTest();
    return;
  }
  const migrationName = process.argv[2] ?? "";
  if (!/^[0-9A-Za-z_]+$/.test(migrationName)) throw new Error("Expected a safe migration name");
  const migrationFile = path.resolve("prisma", "migrations", migrationName, "migration.sql");
  if (!fs.existsSync(migrationFile)) throw new Error("Missing migration file: " + migrationName);

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
      "SELECT COUNT(*) AS count FROM _prisma_migrations WHERE migration_name=? AND finished_at IS NULL AND rolled_back_at IS NULL",
      migrationName,
    );
    if (Number(rows[0]?.count ?? 0) === 0) {
      console.log("No unresolved failed row for " + migrationName);
      return;
    }
    await new Reconciler(prisma).apply(fs.readFileSync(migrationFile, "utf8"));
    console.log("Reconciled migration SQL: " + migrationName);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
