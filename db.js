const NodeFs = require("fs");

const { Storage } = require("./storage");

const DefaultConfig = {
    db: {
        path: ""
    }
};

class DB {
    constructor(config) {
        this.config = Object.assign({}, DefaultConfig, config);
        this.storage = new Storage();

        this._dbChanged = false;
    }

    start() {
        this.load();

        setInterval(() => {
            if (!this._dbChanged) {
                return;
            }
            this.writeDb(this.storage.dbEntities, this.storage.dbEntityTypes);
            console.log("DB Written");
        }, 1000);
    }

    handleRequest(request) {
        if(request.save) {
            this._dbChanged = true
        }
        return this.storage.handleRequest(request);
    }

    load() {
        const db  = this.loadDb()
        this.storage.load({
            dbEntities: db.dbEntities,
            dbEntityTypes: db.dbEntityTypes
        });   
    }

    writeDb(dbEntities, dbEntityTypes) {
        const dbPath = this.config.db.path;
        const db = {
            dbEntities,
            dbEntityTypes
        };
        NodeFs.writeFileSync(dbPath, JSON.stringify(db), { flag: "w" });
        this._dbChanged = false;
    }

    loadDb() {
        const dbPath = this.config.db.path;
        const db = {
            dbEntities: {},
            dbEntityTypes: {}
        };
        try {
            NodeFs.accessSync(dbPath);
        } catch (e) {
            NodeFs.writeFileSync(dbPath, JSON.stringify(db), { flag: "w" });
        }
        const json = NodeFs.readFileSync(dbPath).toString();
        if (json) {
            const data = JSON.parse(json);
            if (data.dbEntities) {
                db.dbEntities = data.dbEntities;
            }
            if (data.dbEntityTypes) {
                db.dbEntityTypes = data.dbEntityTypes;
            }
        }

        return db;
    }
}

module.exports = {
    DB
};
