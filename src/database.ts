

import { DatabaseTypes } from "./database_types";
import SQLite from "better-sqlite3";
import {Kysely, SqliteDialect} from "kysely";

const dialect = new SqliteDialect({
    database: new SQLite("./api.db")
});

export const db = new Kysely<DatabaseTypes>({
    dialect
});