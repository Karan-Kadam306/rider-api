const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const AppError = require('../../errors/AppError');
const mapDatabaseError = require('../../errors/mapDatabaseError');
const { errorHandler } = require('../../middleware/errorHandler');
const { validateWeekStart } = require('../../middleware/validateWeekStart');
const { validateCreateRider } = require('../../middleware/validateCreateRider');
const { validateUpdateRider } = require('../../middleware/validateUpdateRider');
const { validateRiderQuery } = require('../../middleware/validateRiderQuery');

process.env.NODE_ENV = 'test';

// Run a middleware and return the error it passed to next(), if any.
function run(middleware, req) {
    let passed;
    middleware(req, {}, error => { passed = error; });
    return passed;
}

// A minimal stand-in for Express's res object.
function fakeResponse() {
    return {
        headersSent: false,
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

describe('validateWeekStart', () => {
    it('accepts a Monday', () => {
        assert.equal(run(validateWeekStart, { query: { weekStart: '2026-10-12' } }), undefined);
    });

    it('reads weekStart from the path when present', () => {
        assert.equal(run(validateWeekStart, { params: { weekStart: '2026-10-12' }, query: {} }), undefined);

        const error = run(validateWeekStart, { params: { weekStart: '2026-10-13' }, query: {} });
        assert.equal(error.statusCode, 400);
    });

    for (const weekStart of ['2026-10-13', '2026-10-18', '2026-13-01', 'monday', undefined]) {
        it(`rejects ${JSON.stringify(weekStart)} with 400`, () => {
            const error = run(validateWeekStart, { query: { weekStart } });

            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
        });
    }
});

describe('validateCreateRider', () => {
    const valid = { rider_id: 'YS-001', name: 'Karan Kadam', phone: '9876543210' };

    it('accepts a valid rider', () => {
        assert.equal(run(validateCreateRider, { body: valid }), undefined);
    });

    const invalid = [
        ['missing name', { ...valid, name: undefined }],
        ['blank rider_id', { ...valid, rider_id: '   ' }],
        ['phone starting with 5', { ...valid, phone: '5876543210' }],
        ['phone with 9 digits', { ...valid, phone: '987654321' }],
        ['name with numbers', { ...valid, name: 'Karan 2' }],
        ['name without letters', { ...valid, name: '---' }],
        ['rider_id too long', { ...valid, rider_id: 'x'.repeat(101) }],
        ['no body', undefined]
    ];

    for (const [name, body] of invalid) {
        it(`rejects ${name} with 400`, () => {
            assert.equal(run(validateCreateRider, { body })?.statusCode, 400);
        });
    }
});

describe('validateUpdateRider', () => {
    const valid = { name: 'Karan Kadam', phone: '9876543210', status: 'Inactive' };

    it('accepts Active and Inactive', () => {
        assert.equal(run(validateUpdateRider, { body: valid }), undefined);
        assert.equal(run(validateUpdateRider, { body: { ...valid, status: 'Active' } }), undefined);
    });

    it('rejects Terminated: termination must go through DELETE', () => {
        const error = run(validateUpdateRider, { body: { ...valid, status: 'Terminated' } });

        assert.equal(error.statusCode, 400);
        assert.match(error.message, /DELETE/);
    });

    it('rejects an invalid phone', () => {
        assert.equal(run(validateUpdateRider, { body: { ...valid, phone: '123' } }).statusCode, 400);
    });
});

describe('validateRiderQuery', () => {
    it('accepts no query parameters', () => {
        assert.equal(run(validateRiderQuery, { query: {} }), undefined);
    });

    const invalid = [
        ['page 0', { page: '0' }],
        ['limit 101', { limit: '101' }],
        ['unknown sort column', { sortBy: 'phone' }],
        ['unknown order', { order: 'up' }],
        ['unknown status', { status: 'Deleted' }],
        ['repeated parameter', { page: ['1', '2'] }]
    ];

    for (const [name, query] of invalid) {
        it(`rejects ${name} with 400`, () => {
            assert.equal(run(validateRiderQuery, { query })?.statusCode, 400);
        });
    }
});

describe('mapDatabaseError', () => {
    it('maps duplicate chassis number to 409', () => {
        assert.deepEqual(
            mapDatabaseError({ code: '23505', constraint: 'bikes_chassis_number_key' }),
            { statusCode: 409, message: 'Chassis number already registered' }
        );
    });

    it('maps duplicate phone to 409', () => {
        assert.equal(
            mapDatabaseError({ code: '23505', constraint: 'riders_phone_key' }).message,
            'Phone number already registered'
        );
    });

    it('maps foreign-key violations to 409', () => {
        assert.equal(mapDatabaseError({ code: '23503' }).statusCode, 409);
    });

    it('returns null for unknown errors', () => {
        assert.equal(mapDatabaseError(new Error('boom')), null);
    });
});

describe('errorHandler', () => {
    it('returns the AppError status and message', () => {
        const res = fakeResponse();
        errorHandler(new AppError('Bike not found', 404), {}, res, () => {});

        assert.equal(res.statusCode, 404);
        assert.deepEqual(res.body, { error: 'Bike not found' });
    });

    it('maps known database errors', () => {
        const res = fakeResponse();
        const error = Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'riders_pkey' });
        errorHandler(error, {}, res, () => {});

        assert.equal(res.statusCode, 409);
    });

    it('hides internal details of unexpected errors', () => {
        const res = fakeResponse();
        errorHandler(new Error('Sensitive database details'), {}, res, () => {});

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'Internal server error' });
    });
});
