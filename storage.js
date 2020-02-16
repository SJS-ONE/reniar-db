class StorageMaintenance {
    constructor(storage) {
        this.storage = storage;
    }
    rebuildTypes() {
        this.storage.dbEntityTypes = {};
        for (const uuid in this.storage.dbEntities) {
            const entity = this.storage.dbEntities[uuid];
            const type = entity.__type;
            if (!this.storage.dbEntityTypes[type]) {
                this.storage.dbEntityTypes[type] = [];
            }
            this.storage.dbEntityTypes[type].push(entity);
        }
    }
}

const parsePath = path => {
    const ret = {};

    const regexType = /^\[(\w+)\]$/; // [Type]
    const regexUuid = /^<([\d-]+)>$/; // <00-0000...>

    const parts = path.split(".");
    const selectorPart = parts.shift();

    if (regexType.test(selectorPart)) {
        ret.type = selectorPart.match(regexType)[1];
    } else if (regexUuid.test(selectorPart)) {
        ret.uuid = selectorPart.match(regexUuid)[1];
    } else {
        return { skip: true };
    }

    ret.path = parts;

    return ret;
};

class Storage {
    constructor() {
        this.dbEntities = {};
        this.dbEntityTypes = {};
    }

    load(data, overwrite = true) {
        for (const key in data) {
            if (overwrite) {
                this[key] = {};
            }
            Object.assign(this[key], data[key]);
        }
    }

    getEntities(uuids) {
        return Array.isArray(uuids)
            ? uuids.map(uuid => this.dbEntities[uuid]).filter(e => !!e)
            : [];
    }

    getEntitiesFromType(type) {
        return this.dbEntityTypes[type]
            ? this.dbEntityTypes[type].map(uuid => this.dbEntities[uuid])
            : [];
    }

    getTypes(types) {
        if (!Array.isArray(types)) {
            return [];
        }
        return types.map(t => this.getEntitiesFromType(t)).flat();
    }

    setEntities(entities) {
        const setValueForPath = (path, raw, value) => {
            const cur = path.shift();
            if( ! (cur in raw )){
                raw[cur] = {}
            }
            if (typeof raw[cur] === "object" && path.length) {
                setValueForPath(path, raw[cur], value);
            }else{
                raw[cur] = value;
            }
        };

        for (const entity of entities) {
            console.log(entity);
            const res = parsePath(entity.prop);
            if (res.skip || !this.dbEntities[res.uuid]) {
                continue;
            }
            const raw = this.dbEntities[res.uuid];
            setValueForPath(res.path, raw, entity.value);
        }
    }

    saveEntities(entities) {
        for (const entity of entities) {
            if (!entity || !entity.__uuid) {
                continue;
            }
            const uuid = entity.__uuid;
            const type = entity.__type;
            this.dbEntities[uuid] = entity;
            if (!this.dbEntityTypes[type]) {
                this.dbEntityTypes[type] = [];
            }
            if (!this.dbEntityTypes[type].includes(uuid)) {
                this.dbEntityTypes[type].push(uuid);
            }
        }
    }

    /*

    filter: {
        types: {
        and: [{ prop: "Instalment.customer.__uuid", eq: '19903040-1009-4020-1780-803002200000'}]
        }
    }
{
  and: [
    {
      prop: 'Instalment.customer.__uuid',
      eq: '19903040-1009-4020-1780-803002200000'
    }
  ]
}
    
    */

    applyFilterToRaws(filter, raws) {
        const propAffectsRaw = (prop, raw) => {
            if (prop.type) {
                return prop.type === raw.__type;
            }
            if (prop.uuid) {
                return prop.uuid === raw.__uuid;
            }
            return false;
        };

        const getElementValueFromPath = (path, data) => {
            const cur = path.shift();
            const val = data[cur];
            if (path.length !== 0 && typeof val === "object" && val !== null) {
                return getElementValueFromPath(path, val);
            }
            return val;
        };

        const handlePropConstraint = (constraint, raw) => {
            const prop = parsePath(constraint.prop, raw);
            if (prop.skip || !propAffectsRaw(prop, raw)) {
                return true;
            }
            const element = getElementValueFromPath(prop.path, raw);
            if (constraint.eq !== undefined) {
                console.log(element, constraint.eq)
                return element === constraint.eq;
            }
            if (constraint.in) {
                return constraint.in.includes(element);
            }
            if (constraint.undefined) {
                return element === undefined;
            }
            return false;
        };

        const handleAndConstraint = (constraints, raw) => {
            const and = constraints.and.map(c => parseConstraint(c, raw));
            return !and.includes(false);
        };

        const handleOrConstraint = (constraints, raw) => {
            const or = constraints.or.map(c => parseConstraint(c, raw));
            return or.includes(true);
        };

        const parseConstraint = (constraint, raw) => {
            if (constraint.prop) {
                return handlePropConstraint(constraint, raw);
            }
            if (constraint.and) {
                return handleAndConstraint(constraint, raw);
            }
            if (constraint.or) {
                return handleOrConstraint(constraint, raw);
            }
            if (constraint.not) {
                return !parseConstraint(constraint.not, raw);
            }
        };

        raws = raws.filter((raw, index, arr) => {
            return parseConstraint(filter, raw);
        });

        return raws;
    }

    applyOptionsToResult(result, options = {}) {
        if (options.filter) {
            for (const key in options.filter) {
                const raws = result.get[key];
                if (!raws) {
                    continue;
                }
                const keyFilter = options.filter[key];
                result.get[key] = this.applyFilterToRaws(keyFilter, raws);
            }
        }
        return result;
    }

    handleRequest(request) {
        const result = {};
        if (request.save) {
            result.save = this.saveEntities(request.save);
        }
        if (request.set) {
            result.set = this.setEntities(request.set);
        }
        if (request.get && (request.get.uuids || request.get.types)) {
            result.get = {};
            if (request.get.uuids) {
                result.get.uuids = this.getEntities(request.get.uuids);
            }
            if (request.get.types) {
                result.get.types = this.getTypes(request.get.types);
            }
        }
        return this.applyOptionsToResult(result, request.options);
    }
}

module.exports = {
    Storage
};
