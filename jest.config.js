// Unit tests for the shared core (transport/). They never touch the network:
// the HTTP exit is mocked, so no call ever reaches the Nibo API.
module.exports = {
	testEnvironment: 'node',
	testMatch: ['<rootDir>/nodes/**/__tests__/**/*.test.ts'],
	// dist/ holds a copy of package.json after a build; without this jest
	// warns about a "haste module naming collision" on every run.
	modulePathIgnorePatterns: ['<rootDir>/dist/'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	transform: {
		'^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
	},
};
