(function () {
    const STORAGE_KEY = "catalogo_emprendedores_db";
    const TABLES = [
        "usuarios",
        "negocios",
        "Categorias_Negocio",
        "productos/servicios",
        "imagenes_productos"
    ];
    const INITIAL_CATEGORIES = [
        "Gastronomía",
        "Belleza y Cuidado Personal",
        "Moda y Accesorios",
        "Salud y Bienestar",
        "Servicios para el Hogar",
        "Tecnología",
        "Mascotas",
        "Arte y Diseño",
        "Educación"
    ];

    function createEmptyState() {
        const tables = Object.fromEntries(TABLES.map(function (table) {
            return [table, []];
        }));

        tables.Categorias_Negocio = INITIAL_CATEGORIES.map(function (nombre_categoria, index) {
            return { id: index + 1, nombre_categoria: nombre_categoria };
        });

        return {
            version: 1,
            sequences: {
                usuarios: 0,
                negocios: 0,
                Categorias_Negocio: INITIAL_CATEGORIES.length,
                "productos/servicios": 0,
                imagenes_productos: 0
            },
            tables: tables
        };
    }

    function readState() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === null) {
            const initialState = createEmptyState();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState));
            return initialState;
        }

        const state = JSON.parse(stored);
        if (!state || state.version !== 1 || !state.tables || !state.sequences ||
            TABLES.some(function (table) {
                return !Array.isArray(state.tables[table]) ||
                    !Number.isInteger(state.sequences[table]);
            })) {
            throw new Error("La base de datos local no tiene un formato válido.");
        }
        return state;
    }

    function writeState(state) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function assertTable(table) {
        if (!TABLES.includes(table)) {
            throw new Error("Tabla local desconocida: " + table);
        }
    }

    function requiredText(record, field, maxLength) {
        const value = String(record[field] == null ? "" : record[field]).trim();
        if (!value) {
            throw new Error("El campo " + field + " es obligatorio.");
        }
        if (value.length > maxLength) {
            throw new Error("El campo " + field + " supera el máximo de " + maxLength + " caracteres.");
        }
        record[field] = value;
    }

    function requireForeignKey(state, table, id, field) {
        if (!Number.isInteger(Number(id)) ||
            !state.tables[table].some(function (row) { return row.id === Number(id); })) {
            throw new Error("No existe el registro relacionado para " + field + ".");
        }
    }

    function validateRecord(state, table, record, ignoredId) {
        if (table === "usuarios") {
            requiredText(record, "nombre", 255);
            requiredText(record, "correo_electronico", 255);
            requiredText(record, "contrasena", 255);
            record.correo_electronico = record.correo_electronico.toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.correo_electronico)) {
                throw new Error("Ingresa un correo electrónico válido.");
            }
            if (state.tables.usuarios.some(function (user) {
                return user.id !== ignoredId &&
                    user.correo_electronico.toLowerCase() === record.correo_electronico;
            })) {
                throw new Error("Ya existe una cuenta con ese correo electrónico.");
            }
            if (![0, 1, false, true].includes(record.esta_eliminado)) {
                throw new Error("El valor esta_eliminado debe ser 0 o 1.");
            }
            record.esta_eliminado = Number(record.esta_eliminado);
        } else if (table === "negocios") {
            requireForeignKey(state, "usuarios", record.usuario_id, "usuario_id");
            record.usuario_id = Number(record.usuario_id);
            requiredText(record, "nombre", 255);
            requiredText(record, "slug", 255);
            if (state.tables.negocios.some(function (business) {
                return business.id !== ignoredId && business.slug === record.slug;
            })) {
                throw new Error("Ya existe un negocio con ese slug.");
            }
            ["descripcion", "categoria", "ubicacion", "ruta_logo", "enlace_whatsapp",
                "url_facebook", "url_instagram", "url_tiktok"].forEach(function (field) {
                if (record[field] == null) record[field] = null;
            });
        } else if (table === "Categorias_Negocio") {
            requiredText(record, "nombre_categoria", 128);
        } else if (table === "productos/servicios") {
            requireForeignKey(state, "negocios", record.negocio_id, "negocio_id");
            requireForeignKey(
                state,
                "Categorias_Negocio",
                record.Categorias_Negocio_idCategorias_Negocio,
                "Categorias_Negocio_idCategorias_Negocio"
            );
            record.negocio_id = Number(record.negocio_id);
            record.Categorias_Negocio_idCategorias_Negocio =
                Number(record.Categorias_Negocio_idCategorias_Negocio);
            requiredText(record, "nombre", 255);
            if (!["Producto", "Servicio"].includes(record.Tipo)) {
                throw new Error("Tipo debe ser Producto o Servicio.");
            }
            const price = Number(record.precio);
            if (!Number.isFinite(price) || price < 0 || price > 99999999.99) {
                throw new Error("El precio debe ser un número válido entre 0 y 99999999.99.");
            }
            record.precio = price;
            if (![0, 1, false, true].includes(record.esta_activo)) {
                throw new Error("El valor esta_activo debe ser 0 o 1.");
            }
            record.esta_activo = Number(record.esta_activo);
            if (record.descripcion == null) record.descripcion = null;
        } else if (table === "imagenes_productos") {
            requireForeignKey(state, "productos/servicios", record.producto_id, "producto_id");
            record.producto_id = Number(record.producto_id);
            requiredText(record, "ruta_imagen", 255);
            if (![0, 1, false, true].includes(record.es_principal)) {
                throw new Error("El valor es_principal debe ser 0 o 1.");
            }
            record.es_principal = Number(record.es_principal);
        }
    }

    function defaults(table, values) {
        const now = new Date().toISOString();
        const record = Object.assign({}, values);
        if (table === "usuarios") {
            Object.assign(record, {
                correo_verificado_el: null,
                token_recuerdo: null,
                esta_eliminado: 0,
                creado_el: now,
                actualizado_el: now
            }, values);
        } else if (table === "negocios") {
            Object.assign(record, {
                descripcion: null,
                categoria: null,
                ubicacion: null,
                ruta_logo: null,
                enlace_whatsapp: null,
                url_facebook: null,
                url_instagram: null,
                url_tiktok: null,
                creado_el: now,
                actualizado_el: now
            }, values);
        } else if (table === "Categorias_Negocio") {
            Object.assign(record, values);
        } else if (table === "productos/servicios") {
            Object.assign(record, {
                descripcion: null,
                esta_activo: 1,
                creado_el: now,
                actualizado_el: now
            }, values);
        } else if (table === "imagenes_productos") {
            Object.assign(record, { es_principal: 0, creado_el: now }, values);
        }
        return record;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function getAll(table) {
        assertTable(table);
        return clone(readState().tables[table]);
    }

    function findById(table, id) {
        assertTable(table);
        const row = readState().tables[table].find(function (item) {
            return item.id === Number(id);
        });
        return row ? clone(row) : null;
    }

    function insert(table, values) {
        assertTable(table);
        const state = readState();
        const record = defaults(table, values);
        record.id = ++state.sequences[table];
        validateRecord(state, table, record, null);
        state.tables[table].push(record);
        writeState(state);
        return clone(record);
    }

    function update(table, id, changes) {
        assertTable(table);
        const state = readState();
        const existing = state.tables[table].find(function (row) {
            return row.id === Number(id);
        });
        if (!existing) {
            throw new Error("No se encontró el registro que intentas actualizar.");
        }
        const updated = Object.assign({}, existing, changes, { id: existing.id });
        if (table === "usuarios" || table === "negocios" || table === "productos/servicios") {
            updated.actualizado_el = new Date().toISOString();
        }
        validateRecord(state, table, updated, existing.id);
        Object.assign(existing, updated);
        writeState(state);
        return clone(existing);
    }

    function remove(table, id) {
        assertTable(table);
        const state = readState();
        const numericId = Number(id);
        const rows = state.tables[table];
        const index = rows.findIndex(function (row) { return row.id === numericId; });
        if (index === -1) return false;

        if (table === "Categorias_Negocio" &&
            state.tables["productos/servicios"].some(function (product) {
                return product.Categorias_Negocio_idCategorias_Negocio === numericId;
            })) {
            throw new Error("No se puede eliminar una categoría que tiene productos o servicios.");
        }
        if (table === "usuarios") {
            const businessIds = state.tables.negocios
                .filter(function (business) { return business.usuario_id === numericId; })
                .map(function (business) { return business.id; });
            businessIds.forEach(function (businessId) {
                removeBusinessAndProducts(state, businessId);
            });
        } else if (table === "negocios") {
            removeBusinessAndProducts(state, numericId);
        } else if (table === "productos/servicios") {
            state.tables.imagenes_productos = state.tables.imagenes_productos
                .filter(function (image) { return image.producto_id !== numericId; });
        }

        if (table !== "negocios") {
            state.tables[table].splice(index, 1);
        }
        writeState(state);
        return true;
    }

    function removeBusinessAndProducts(state, businessId) {
        const productIds = state.tables["productos/servicios"]
            .filter(function (product) { return product.negocio_id === businessId; })
            .map(function (product) { return product.id; });
        state.tables.imagenes_productos = state.tables.imagenes_productos
            .filter(function (image) { return !productIds.includes(image.producto_id); });
        state.tables["productos/servicios"] = state.tables["productos/servicios"]
            .filter(function (product) { return product.negocio_id !== businessId; });
        state.tables.negocios = state.tables.negocios
            .filter(function (business) { return business.id !== businessId; });
    }

    window.CatalogoDB = Object.freeze({
        getAll: getAll,
        findById: findById,
        insert: insert,
        update: update,
        remove: remove,
        storageKey: STORAGE_KEY
    });
})();
