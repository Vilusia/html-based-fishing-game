
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
const GAME_VERSION = "v10.65";
const MAX_VOICE_DISTANCE = 50;

// --- MODULAR CHARACTER PART TYPES ---
// All parts are free and unlocked by default

const EAR_TYPES = [
    { id: 'none', name: 'None' },
    { id: 'cat', name: 'Cat (Pointed)' },
    { id: 'bunny', name: 'Bunny (Long)' },
    { id: 'dog', name: 'Dog (Floppy)' },
    { id: 'bear', name: 'Bear (Round)' },
    { id: 'fox', name: 'Fox (Tall Pointed)' },
    { id: 'pig', name: 'Pig (Small)' },
    { id: 'dragon', name: 'Dragon (Horns)' },
    { id: 'mouse', name: 'Mouse (Big Round)' },
    { id: 'raccoon', name: 'Raccoon (Pointy)' },
    { id: 'koala', name: 'Koala (Fluffy)' },
    { id: 'cow', name: 'Cow (Horns + Side)' },
    { id: 'monkey', name: 'Monkey (Side Circle)' },
    { id: 'protogen', name: 'Protogen (Robotic)' },
];

const EYE_TYPES = [
    { id: 'standard', name: 'Standard' },
    { id: 'dragon', name: 'Dragon (Slit)' },
    { id: 'frog', name: 'Frog (Bulbous)' },
    { id: 'cute', name: 'Cute (Big)' },
    { id: 'sleepy', name: 'Sleepy' },
    { id: 'angry', name: 'Angry' },
    { id: 'cat_eyes', name: 'Cat Eyes' },
    { id: 'sparkle', name: 'Sparkle' },
    { id: 'dizzy', name: 'Dizzy' },
    { id: 'heart', name: 'Heart Eyes' },
    { id: 'x_eyes', name: 'X Eyes' },
    { id: 'dot', name: 'Dot Eyes' },
    { id: 'protogen', name: 'Protogen (Visor)' },
];

const NOSE_TYPES = [
    { id: 'cat', name: 'Cat (Pink)' },
    { id: 'dog', name: 'Dog (Black)' },
    { id: 'bear', name: 'Bear (Snout)' },
    { id: 'pig', name: 'Pig (Snout)' },
    { id: 'duck', name: 'Duck (Bill)' },
    { id: 'dragon', name: 'Dragon (Nostrils)' },
    { id: 'mouse', name: 'Mouse (Whiskers)' },
    { id: 'axolotl', name: 'Axolotl (Smile)' },
    { id: 'koala', name: 'Koala (Big)' },
    { id: 'cow', name: 'Cow (Wide)' },
    { id: 'frog', name: 'Frog (Wide Mouth)' },
    { id: 'penguin', name: 'Penguin (Beak)' },
    { id: 'monkey', name: 'Monkey (Skin)' },
    { id: 'protogen', name: 'Protogen (Screen)' },
];

const MISC_TYPES = [
    { id: 'none', name: 'None' },
    { id: 'fox_cheeks', name: 'Fox Cheeks' },
    { id: 'dragon_wings', name: 'Dragon Wings' },
    { id: 'axolotl_gills', name: 'Axolotl Gills' },
    { id: 'raccoon_mask', name: 'Raccoon Mask' },
    { id: 'lion_mane', name: 'Lion Mane' },
    { id: 'penguin_belly', name: 'Penguin Belly' },
    { id: 'protogen_visor', name: 'Protogen Visor' },
];

const TAIL_TYPES = [
    { id: 'none', name: 'None' },
    { id: 'cat', name: 'Cat' },
    { id: 'bunny', name: 'Bunny (Puff)' },
    { id: 'dog', name: 'Dog (Wagging)' },
    { id: 'bear', name: 'Bear (Small)' },
    { id: 'fox', name: 'Fox (Fluffy)' },
    { id: 'pig', name: 'Pig (Curly)' },
    { id: 'dragon', name: 'Dragon (Spike)' },
    { id: 'mouse', name: 'Mouse (Thin)' },
    { id: 'duck', name: 'Duck (Feathers)' },
    { id: 'axolotl', name: 'Axolotl (Fin)' },
    { id: 'raccoon', name: 'Raccoon (Striped)' },
    { id: 'lion', name: 'Lion' },
    { id: 'monkey', name: 'Monkey (Long)' },
    { id: 'penguin', name: 'Penguin (Small)' },
    { id: 'frog', name: 'Frog (Spots)' },
    { id: 'protogen', name: 'Protogen (Mech)' },
];
