
(function () {
    // Replace 'your-website.com' with your actual domain (e.g., 'itch.io')
    // Keep 'localhost' and '127.0.0.1' so you can still test it on your computer
    var allowedDomains = ["htmlfishing.com", "localhost", "127.0.0.1"];

    // Check if the current domain is in the allowed list
    var currentDomain = window.location.hostname;

    // If domain is NOT allowed...
    if (!allowedDomains.some(d => currentDomain.includes(d))) {
        // ...Delete the entire game and show a warning
        document.body.innerHTML = "<h1 style='color:red;text-align:center;margin-top:20%'>PIRATED VERSION DETECTED<br>Please play on the official site.</h1>";

        // Throw a fake error to stop all other scripts from running
        throw new Error("Fatal: Invalid Domain");
    }
})();
// --- CORE GAME CONFIGURATION ---
const GAME_VERSION = "v10.21";
const MAX_VOICE_DISTANCE = 50;
