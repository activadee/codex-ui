const animatePlugin = require("tailwindcss-animate")

/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		"./index.html",
		"./src/**/*.{ts,tsx,js,jsx}"
	],
	plugins: [animatePlugin]
}
