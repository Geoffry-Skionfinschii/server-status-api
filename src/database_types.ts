import { GeneratedAlways } from "kysely"


export interface DatabaseTypes {
    servers: ServerTable,
    auth: AuthTable
}

export interface ServerTable {
    id: GeneratedAlways<number>;
    name: string;
    token: string;

    game_type?: string;
    game_host?: string;
    game_port?: number;
}

export interface AuthTable {
    email: string;
    token: string;
}