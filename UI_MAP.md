# UI_MAP.md

Top-level declarations in ui.js as name:line, grouped by comment headers. Rerun after big edits.

UICache:2, isHandsHidden:3, pickableFlowers:4

### SKY (line 6)
STAR_RADIUS:10, SKY_ORBIT_RADIUS:11

### SKILL SYSTEM HELPERS (line 13)
addSkillXP:14, getSkillLevel:41, tradingSellMultiplier:47, cookingBurnChance:54

### WATER SURFACE QUERY (line 59)
waterSurfaceAt:64, getResourceForLevel:102, cacheUIElements:125, updateUI:131

### MERCHANT SHOP SYSTEM (line 228)
toggleMerchant:229, updateMerchantUI:251, reconcileFishInventory:417, refreshCookingAfterSale:422, availableCookingFish:427, autoSortInventory:511

### FLOWER COLLECTION SYSTEM (line 660)
tryPickNearbyFlower:663, playSnagSound:761, copyFallback:792, checkMobile:817, checkOrientation:823, initAudio:828, applyNoiseFilters:884, populateAudioInputs:909
setupVoiceAnalysis:944, toggleMic:953, updateMicUI:960, connectToPeerAudio:974, embedImageIfValid:987, handleCall:1015, voiceWatchdog:1042, setVoiceActivity:1098
VOICE_DATA_ARRAY:1106, syncRemoteVoiceVolumes:1109, updateVoiceVisuals:1128

### GAME INITIALIZATION & LOBBY (line 1185)
generateRoomId:1256, hostGame:1257, joinGame:1375, LEVEL_SESSION_KEY:1488, LEVEL_HASH_KEY:1489, LEVEL_CHUNK:1492, levelNavPending:1493, levelParts:1494
levelFingerprint:1496, acceptHostLevel:1504, dropActiveLevel:1531, MASTER_SERVER_URL:1556, MASTER_TIMEOUT_MS:1557, LOBBY_HEARTBEAT_MS:1558, lobbyHeartbeatTimer:1560, lobbyPublished:1561
lobbyDirectorySession:1563, lobbyDirectoryVerified:1564, myLobbyName:1565, serverBrowserTimer:1566, LOBBY_TAGS:1571, MAX_LOBBY_TAGS:1577, browserTagFilter:1581, browserAdultOnly:1582
browserSort:1583, masterEnabled:1585, masterRequest:1587

### lobby naming (line 1606)
defaultLobbyName:1608, lobbyNameFromUI:1613, lobbyIsPublic:1619

### Make Lobby screen (line 1625)
lobbyDraft:1630, renderTagButtons:1641, openCreateLobby:1658, closeCreateLobby:1703

### directory registration (line 1739)
lobbyPlayerCount:1741, lobbyDirectoryId:1747, removeOwnedLobby:1754, publishLobby:1761, startLobbyHeartbeat:1820, stopLobbyHeartbeat:1826, unpublishLobby:1833, leaveLobbyDirectory:1844

### server browser (line 1865)
openServerBrowser:1867, paintBrowserTagFilter:1879, initBrowserFilters:1887, updateServerFilterCount:1935, clearServerBrowserFilters:1939, closeServerBrowser:1947, refreshServerBrowser:1955, renderServerList:1982
buildServerRow:2036, joinBrowsedServer:2146

### WORLD GENERATION (line 2158)

### TEXTURE GENERATORS (line 2159)
createNoiseTexture:2160, createLeafTexture:2205

### VISUAL UPGRADE: ROCKS (line 2247)

### VISUAL UPGRADE: ROCKS (line 2248)
createRockMesh:2249

### VISUAL UPGRADE: DETAILED TREES (line 2273)

### VISUAL UPGRADE: COZY FLUFFY TREES (line 2274)
createDetailedTree:2275

### TERRAIN HEIGHT SYSTEM (line 2315)
createFlowerMesh:2456, isInCaveEntranceZone:2481, customLevelDecor:2487, disposeDecorGroup:2489

### CUSTOM LEVEL FLOWERS (line 2501)
spawnCustomLevelFlowers:2506, spawnOceanIslandFlowers:2613, getDefaultNpcSpawns:2663, isDefaultNpcAreaClear:2676, DEFAULT_PATH_RING:2685, DEFAULT_PATHS:2689, DEFAULT_BENCHES:2700, distanceToPathSegmentSq:2708
isOnDefaultPath:2715, generateWorld:2725, handleDataFromClient:2940, handleDataFromHost:3210, broadcastPlayerList:3427, broadcastToClients:3446, sendUpdate:3447, equippedToolFromSave:3556
makeHeldTool:3565, syncRemoteHeldItems:3581, createRemotePlayer:3594, updateRemotePlayer:3653, initChatPool:3788, gameAnchorSyncTimer:3802, lastGameAnchorSpace:3803, measureGameAnchorHeight:3808
syncGameAnchorSpace:3841, startGameAnchorSync:3851, startGame:3859, sendChatMessage:3874

### SECURITY FIX: Safe Image Embedding (line 3908)
CHAT_IMAGE_HOSTS:3911, allowedChatImageUrl:3912, safeEmbedImage:3920, GIF_API_KEY:3946, GIF_CLIENT_KEY:3948, GIF_LIMIT:3949, GIF_TIMEOUT_MS:3950, GIF_API_HOST:3954
GIF_MEDIA_HOSTS:3959, isAllowedGifUrl:3963, gifSearchAbort:3968, gifLastQuery:3969, gifNext:3970, gifStatus:3972, gifRenderResults:3979, gifPick:4011
gifClosePanel:4028, gifOpenPanel:4035, gifFetch:4054, gifParams:4073, gifLoadTrending:4085, gifSearch:4099, gifLoadMore:4116, setupGifPicker:4138
displayChatMessage:4175, wrapChatBubbleText:4259, showChatBubble:4274, createLavaWorld:4338, waterfallMesh:4457, makeCaveRockCollider:4460, caveRockSurfaceY:4476, caveRockTopAt:4486
staticColliderHits:4496, caveRockBlocksLine:4505, cavePlatformRoute:4516, createCavePlatforms:4524, cavePlatformTopAt:4535, createWaterfallZone:4546, createPathRibbon:4698, makeDecorProp:4745
addPathLamp:4755, addLilyPads:4786, addReedCluster:4801, addPondGlow:4824, addDeadTree:4834, addCaveDecor:4853, createVoidShrine:4875, createLavaShrine:4902
createDefaultIslandDecor:4920, addHotspotParticles:4986, LIGHT_SUN_DAY:4996, LIGHT_SUN_GOLD:4997, LIGHT_MOON:4998, LIGHT_FILL_DAY:4999, LIGHT_FILL_NIGHT:5000, LIGHT_HEMI_DAY_SKY:5001
LIGHT_HEMI_DAY_GROUND:5002, LIGHT_HEMI_NIGHT_SKY:5003, LIGHT_HEMI_NIGHT_GROUND:5004, _lightSun:5005, _lightHemiSky:5006, _lightHemiGround:5007, _lightFill:5008, applyWorldLights:5010
updateDayNightCycle:5026, createRainSystem:5203

### RETRO POST-PROCESSING (line 5249)
retroPipeline:5254, RETRO_PIXEL_SIZES:5255, retroPixelSize:5257, createRetroPipeline:5262, ensureRetroPipeline:5339, resizeRetroPipeline:5343, renderGameView:5355

### THREE.JS SCENE SETUP (line 5382)
setupThreeJS:5383, createSpeakerTexture:5822, createCabin:5833, createNPCs:5840, addIcon:5949

### DYNAMIC TEXTURE DRAWING FUNCTIONS (line 5956)
drawHat:5957, updateDebugUI:6496, updateMidiUI:6510

### MODULAR CHARACTER DRAWING FUNCTIONS (line 6518)
rrect:6522, drawBody:6538, applyHeadLighting:6592, shadeColor:6618, drawEars:6629, drawEyes:6843, drawNose:7199, drawMisc:7400
drawTail:7931, drawTalkingMouth:8257, drawProtogenFace:8267, drawSpecies:8289, restorePants:8353, selectPants:8358, paintPants:8367, createPantsTexture:8385
drawPants:8390, drawShirt:8398, drawCollar:8667, drawBodyPaint:8779, drawHair:8820, addSpriteOutline:10028, createSpeciesTexture:10060, createFishTexture:10144
createNameTagTexture:10995, createTitleTexture:11006, createRodTexture:11022

### CHARACTER BODY (sprite or procedural 3D model) (line 11170)
characterLookFromCfg:11176, createBodySideTexture:11193, makeCharacterBody:11205, ensureOpenMouthMaterial:11263, disposeCharacterBody:11282, replaceCharacterBody:11294, ROD_IDLE_2D:11311, rodAngleFor:11314
makeRod:11319, makeHeldFish:11340, characterCfgFromSave:11360, characterCfgFromData:11391, createPlayerMesh:11423, createLocalPlayer:11465, attachSailBoat:11492, createBoatTexture:11503
makeSailBoatMesh:11529, findCustomSpawn:11542, findCustomLavaKeeperSpot:11564, renderKeybinds:11593, startRebind:11653, handleRebind:11667, resetKeybinds:11690

### CHAT VOICE (Animal Crossing-style) (line 11698)
hashString:11703, TALK_MOUTH_SHAPES:11712, startPlayerTalking:11719, updateTalkingPlayers:11737, setSitting:11773, applySittingPose:11783, bellySlideDirection:11812, applyBellySlidePose:11821
characterBlinkClosed:11836, ensureBlinkMaterial:11842, sync3DRodGrip:11850, chatTypingActive:11934, updateStandingAnimation:11938, updateReelingAnimation:11955, updateJumpAnimation:11980, syncHudLabel:11997
syncCharacterOverhead:12009, updateSpriteDirection:12019, setupInputs:12064, chopInterval:12539, dismissHeldFishForCast:12540, handleAction:12556, releaseCast:12656

### ONE LINE BOBBER HELPER (line 12816)
createBobberMesh:12817, createBobber:12854, performPunch:12902, handleHit:12951

### ANIMATION TRACKING (line 12975)
punchAnimFrameId:12976, animatePunch:12978, scheduleBite:13008

### MINIGAME REWORK (Tension / Tracking) (line 13030)
startMinigame:13031, stopFishing:13114

### MINIGAME LOOP (line 13231)

### MINIGAME LOOP (line 13232)
updateMinigameUI:13233, showToast:13352

### GHOST/HAUNTING MECHANIC (line 13371)

### GHOST/HAUNTING MECHANIC (line 13372)
spawnGhostMesh:13373, ghostMesh:13400, ghostDespawnTime:13401, nextGhostSpawn:13402

### CO-OP WORLD BOSS (line 13404)
nextWorldBossAt:13405, worldBossBeacon:13406, findWorldBossSpot:13408, showWorldBossBeacon:13423, removeWorldBossBeacon:13446, updateWorldBoss:13450, relayBossMessage:13478, updateGhost:13495
triggerHaunt:13526, cleanupPeerConnection:13552, removePlayer:13564, MOBILE_FPS_INTERVAL:13609, lastFrameTime:13610, standableTopAt:13616, animate:13644, escapeHTML:14525

### SECURITY: coerce fish objects that arrived from the network (line 14535)
sanitizeFish:14539

### LINE OF SIGHT MATH HELPERS (line 14560)
lineIntersectsCircle:14563, lineIntersectsBox:14586, checkLineOfSight:14619

### SKILLS UI (line 14658)
renderSkillsUI:14674

### COOKING SYSTEM (line 14715)
COOK_VALUE_MULT:14718, COOK_BURN_VALUE_MULT:14719, isCookableFish:14721, makeCookedFish:14726, cookableIndexes:14753, renderCookingUI:14755, cookingMini:14803, updateCookingMinigameUI:14816
startCookingMinigame:14833, cookFishByName:14967, defaultHotbar:14973, setupHotbar:14984, updateHotbarVisuals:15024, selectHotbarSlot:15059

### PIXEL-ART TOOL SPRITE HELPER (line 15111)
makeToolTexture:15116

### HELPER: AXE TEXTURE (line 15137)
createAxeTexture:15138, equipAxe:15164, createPickaxeTexture:15166, equipPickaxe:15194

### HELPER: GUITAR TEXTURE (line 15196)
createGuitarTexture:15197

### HELPER: BOXING GLOVE TEXTURE (line 15230)
createGloveTexture:15231, performChop:15261, chopTree:15292, performMine:15377, mineRock:15408, respawnRock:15486, mulberry32:15505, xmur3:15506
migrateSave:15512, loadSave:15526, saveGame:15846, updateWeatherVisuals:15931

### UI TOGGLE & UPDATE FUNCTIONS (line 15968)
updateTitleUI:15976, refreshAllTitles:15984, chatFadeTimer:16003, refreshChatFade:16005, toggleFullScreen:16026, toggleShowFish:16038, isFishCatchable:16073, selectFish:16131
updateJournal:16328

### PLAYER TRADING (line 16340)
tradePartnerId:16341, tradePendingFrom:16342, tradePendingFromName:16343, tradeMyOffer:16344, tradeTheirOffer:16345, tradeIAccepted:16346, tradeTheyAccepted:16347, relayTrade:16349
checkTradeComplete:16389, renderTradeUI:16413, handleTradeMessage:16442, setupPanelTabBar:16496, PANEL_OVERLAY_IDS:16516, closeAllPanels:16526, closeTopOverlay:16537, switchPanel:16593
nextPanelTabBarUpdate:16620, updatePanelTabBar:16621, getFishSellPrice:16631, addFishToInventory:16646, getItemTooltipText:16654, showItemTooltip:16687, hideItemTooltip:16701, invFilterMode:16735
ensureInventorySlots:16737, renderInventoryGrid:16769, setupHotbarDrag:16890, OPTIONS_TABS:16914, optionsActiveTab:16915

### TUTORIAL NPC GUIDE (line 16981)
npcTutorial:16982, npcFisher:16983, startGuidedTour:16997

### OLD FISHER DIALOGUE (line 16999)
fisherTipIndex:17001, FISHER_TIPS:17002, maybeShowFisherHint:17033

### MODULAR PART CHANGE FUNCTIONS (line 17107)

### PART COLOR CHANGE FUNCTIONS (line 17161)
populatePartSelectors:17198, updateMusicUI:17296, updateLocalVisuals:17304, updateBaitSelector:19058, createPortalTexture:19089, spawnPortal:19117, createVoidWorld:19145, findCustomPortalLocation:19166
enterLavaWorld:19180, exitLavaWorld:19201, enterVoid:19216, nearLaunchableWater:19298, setSailBoatVisible:19316, togglePlayerList:19361, renderPlayerList:19367, toggleLocalMute:19450
updateHostPanel:19468, kickPeer:19642, banPeer:19656, toggleGlobalMute:19682, respawnTree:19701, respawnFlower:19720

### HUD TOGGLE (line 19729)
hudVisible:19730, toggleHud:19731, update3DColorControls:19787, updateCharacterModelUI:19812, updatePerformanceUI:19831