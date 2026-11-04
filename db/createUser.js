// Creates an admin panel user. Prompts for anything not given as a flag.
// Usage: npm run user:create
//        npm run user:create -- --email admin@example.com --name "Admin" --role admin
// The password is always typed at the prompt, so it never lands in shell history.
const readline = require('readline');
const { pool } = require('../db');
const userService = require('../services/userService');

function flag(name) {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

async function createUser() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // The iterator buffers lines, so piped input is not lost between questions.
    const lines = rl[Symbol.asyncIterator]();

    async function ask(question, { hidden = false } = {}) {
        process.stdout.write(question);

        // Stop echoing typed characters while a password is entered.
        if (hidden) {
            rl._writeToOutput = () => {};
        }

        const { value, done } = await lines.next();

        if (hidden) {
            delete rl._writeToOutput;
            process.stdout.write('\n');
        }

        if (done) {
            throw new Error('Input ended before all questions were answered');
        }

        return value;
    }

    try {
        const email = flag('email') ?? await ask('Email: ');
        const name = flag('name') ?? await ask('Name: ');
        const role = flag('role') ?? await ask(`Role (${userService.ROLES.join('/')}): `);
        const password = await ask('Password: ', { hidden: true });

        if (await ask('Repeat password: ', { hidden: true }) !== password) {
            throw new Error('Passwords do not match');
        }

        const user = await userService.createUser({ email, name, password, role: role.trim() });
        console.log(`Created ${user.role} ${user.email} (user ${user.userId}).`);
    } finally {
        rl.close();
        await pool.end();
    }
}

createUser().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
