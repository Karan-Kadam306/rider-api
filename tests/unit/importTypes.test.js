const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const dailyKm = require('../../services/importTypes/dailyKm');

// Rows as csv-parse returns them (already trimmed), on lines 2, 3, 4...
function rowErrors(rows) {
    const lineNumbers = rows.map((row, index) => index + 2);
    return Object.fromEntries(dailyKm.findRowErrors(rows, lineNumbers));
}

describe('Daily KM row checks', () => {
    it('accepts whole and decimal KM, including 0', () => {
        assert.deepEqual(
            rowErrors([{ VIN: 'A', KM: '0' }, { VIN: 'B', KM: '12.5' }, { VIN: 'C', KM: '140' }]),
            {}
        );
    });

    it('reports a missing VIN or KM', () => {
        assert.deepEqual(rowErrors([{ VIN: '', KM: '10' }, { VIN: 'A', KM: '' }, { VIN: 'B' }]), {
            0: 'VIN is required',
            1: 'KM is required',
            2: 'KM is required'
        });
    });

    it('reports KM that is negative or not a number', () => {
        assert.deepEqual(rowErrors([{ VIN: 'A', KM: '-1' }, { VIN: 'B', KM: '10km' }, { VIN: 'C', KM: 'Infinity' }]), {
            0: 'KM must be a number of 0 or more',
            1: 'KM must be a number of 0 or more',
            2: 'KM must be a number of 0 or more'
        });
    });

    it('reports a repeated VIN against the first valid occurrence', () => {
        assert.deepEqual(
            rowErrors([{ VIN: 'A', KM: '-1' }, { VIN: 'A', KM: '10' }, { VIN: 'A', KM: '12' }]),
            {
                0: 'KM must be a number of 0 or more',
                // Line 3 is the first valid row for VIN A.
                2: 'VIN already appears on line 3'
            }
        );
    });
});
