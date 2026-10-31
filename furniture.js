// Furniture economy, half-unit grid layouts, support surfaces and inexpensive models.
(function () {
    'use strict';
    const LIMIT = 280, STORAGE_LIMIT = 300, STEP = .5, INTERIOR_HEIGHT = 6.4;
    const ROOM_SIZES = Object.freeze([
        Object.freeze({ name: 'Cozy', width: 12, depth: 10, price: 0 }),
        Object.freeze({ name: 'Spacious', width: 18, depth: 14, price: 10000 }),
        Object.freeze({ name: 'Grand', width: 24, depth: 18, price: 25000 })
    ]);
    function floorPlan(house, width = 660, height = 540) {
        const room = roomSize(house), scale = Math.min((width-48)/room.width,(height-48)/room.depth);
        return { scale, cx: width/2, cy: height/2, left: width/2-room.width*scale/2, top: height/2-room.depth*scale/2, width: room.width*scale, height: room.depth*scale };
    }
    const planPoint = (plan,x,y) => ({ x: (x-plan.cx)/plan.scale, z: (y-plan.cy)/plan.scale });
    const wallLength = item => Number.isFinite(item?.length) ? Math.round(Math.max(.5,Math.min(6,item.length))*4)/4 : 3;
    const sizeTier = house => Number.isInteger(house?.sizeTier) && house.sizeTier >= 0 && house.sizeTier < ROOM_SIZES.length ? house.sizeTier : 0;
    const roomSize = house => ROOM_SIZES[sizeTier(house)];
    const limits = house => ({ furniture: [75,125,200][sizeTier(house)], rooms: [30,50,80][sizeTier(house)] });
    const usage = house => ({ furniture: house.furniture.filter(v=>!isRoomPiece(v.type)).length, rooms: house.furniture.filter(v=>isRoomPiece(v.type)).length });
    function capacityError(house, type, extra = 1) {
        const key=isRoomPiece(type)?'rooms':'furniture';
        return usage(house)[key]+extra>limits(house)[key] ? (key==='rooms'?'Room-piece':'Furniture')+' limit reached for this interior.' : '';
    }
    function upgradeHouse(house, money) {
        const next = sizeTier(house)+1, size = ROOM_SIZES[next];
        if (!size) return { ok: false, error: 'Your interior is already the largest size.' };
        if (!Number.isFinite(money) || money < size.price) return { ok: false, error: 'Not enough money for this interior upgrade.' };
        const upgraded = { ...copy(house), sizeTier: next };
        upgraded.furniture = normalizeLayout(upgraded.furniture, upgraded);
        return { ok: true, money: money-size.price, house: upgraded };
    }
    const catalog = [
        { id: 'room_wall', name: 'Room wall', price: 400, w: 3, d: .25, h: INTERIOR_HEIGHT, style: 'room_wall', color: '#eadac4', section: 'Room building' },
        { id: 'room_doorway', name: 'Open doorway', price: 600, w: 3, d: .25, h: INTERIOR_HEIGHT, style: 'room_doorway', color: '#eadac4' },
        { id: 'chair', name: 'Wooden chair', price: 250, w: 1, d: 1, h: 1.8, color: '#b58658', section: 'Classics' },
        { id: 'table', name: 'Dining table', price: 750, w: 2, d: 1.5, h: 1.2, surface: { w: 1.8, d: 1.3, y: 1.2 }, color: '#b58658' },
        { id: 'coffee_table', name: 'Coffee table', price: 500, w: 2, d: 1, h: .65, surface: { w: 1.8, d: .9, y: .65 }, color: '#ad7851' },
        { id: 'desk', name: 'Writing desk', price: 950, w: 2, d: 1, h: 1.25, surface: { w: 1.8, d: .9, y: 1.25 }, color: '#966847' },
        { id: 'nightstand', name: 'Nightstand', price: 400, w: 1, d: 1, h: .85, surface: { w: .9, d: .9, y: .85 }, color: '#bc9267' },
        { id: 'sofa', name: 'Cozy sofa', price: 1600, w: 2.5, d: 1.5, h: 1.4, color: '#779e8d' },
        { id: 'bed', name: 'Patchwork bed', price: 2000, w: 2, d: 3, h: 1.3, color: '#8c9fbb' },
        { id: 'bookcase', name: 'Bookcase', price: 1200, w: 1.5, d: 1, h: 2.3, surface: { w: 1.3, d: .8, y: 2.3 }, color: '#a77b55' },
        { id: 'rug', name: 'Woven rug', price: 300, w: 3, d: 2, h: .025, rug: true, color: '#c5966d' },
        { id: 'lamp', name: 'Table lamp', price: 350, w: .5, d: .5, h: .9, stackable: true, color: '#ead6a2' },
        { id: 'plant', name: 'Potted plant', price: 200, w: .5, d: .5, h: .95, stackable: true, color: '#75a571' },
        { id: 'books', name: 'Stack of books', price: 100, w: .5, d: .5, h: .24, stackable: true, color: '#ad8175' },
        { id: 'vase', name: 'Ceramic vase', price: 150, w: .5, d: .5, h: .55, stackable: true, color: '#86b9bb' },
        { id: 'aquarium', name: 'Decorative aquarium', price: 2500, w: 1.5, d: 1, h: .8, stackable: true, color: '#6aadb9' },

        // --- Living room ---
        { id: 'armchair', name: 'Armchair', price: 450, w: 1, d: 1, h: 1.1, style: 'upholstered', color: '#8a5a44', section: 'Living room' },
        { id: 'loveseat', name: 'Loveseat', price: 1100, w: 2, d: 1.3, h: 1.2, style: 'upholstered', color: '#6f8593' },
        { id: 'sectional', name: 'Sectional sofa', price: 2600, w: 3, d: 2, h: 1.3, style: 'upholstered', color: '#7d6f5f' },
        { id: 'ottoman', name: 'Ottoman', price: 350, w: 1.1, d: 1.1, h: .55, style: 'ottoman', color: '#a8865f' },
        { id: 'recliner', name: 'Recliner', price: 900, w: 1.2, d: 1.4, h: 1.2, style: 'upholstered', color: '#5f6e5c' },
        { id: 'beanbag', name: 'Bean bag', price: 250, w: 1.2, d: 1.2, h: .65, style: 'beanbag', color: '#b26b5e' },
        { id: 'tv_stand', name: 'TV stand', price: 700, w: 2.6, d: .8, h: .6, style: 'cabinet', surface: { w: 2.5, d: .7, y: .6 }, color: '#5b4a3d' },
        { id: 'stream_tv', name: 'Flat-screen TV', price: 1200, w: 2.4, d: .45, h: 1.8, style: 'stream_tv', stackable: true, color: '#2a2e35' },
        { id: 'wall_tv', name: 'Big Wall TV', price: 3000, w: 9, d: .2, h: 5.2, style: 'wall_tv', wall: true, mountY: 2.85, screen: { w: 8.8, h: 4.95, y: 0, forward: .15 }, color: '#20242c' },
        { id: 'fireplace', name: 'Fireplace', price: 1400, w: 2.4, d: .6, h: 2, style: 'fireplace', color: '#7c6f63' },
        { id: 'console_table', name: 'Console table', price: 600, w: 2.6, d: .6, h: .9, style: 'table', surface: { w: 2.5, d: .5, y: .9 }, color: '#8d6544' },
        { id: 'side_table', name: 'Side table', price: 300, w: .8, d: .8, h: .7, style: 'table', surface: { w: .7, d: .7, y: .7 }, color: '#a97a4e' },

        // --- Bedroom ---
        { id: 'twin_bed', name: 'Twin bed', price: 1200, w: 1.4, d: 2.4, h: 1.1, style: 'bed', color: '#8fa6c0', section: 'Bedroom' },
        { id: 'king_bed', name: 'King bed', price: 3200, w: 2.4, d: 3.2, h: 1.4, style: 'bed', color: '#9c7b8f' },
        { id: 'bunk_bed', name: 'Bunk bed', price: 2400, w: 1.6, d: 3, h: 2.3, style: 'bunk', color: '#b08a5f' },
        { id: 'wardrobe', name: 'Wardrobe', price: 1600, w: 1.8, d: .8, h: 2.6, style: 'cabinet', color: '#7a5540' },
        { id: 'dresser', name: 'Dresser', price: 1000, w: 1.6, d: .7, h: 1.1, style: 'cabinet', surface: { w: 1.4, d: .6, y: 1.1 }, color: '#8a6242' },
        { id: 'vanity', name: 'Vanity', price: 1200, w: 1.4, d: .7, h: 1.5, style: 'vanity', surface: { w: 1.2, d: .6, y: 1.5 }, color: '#b08b6a' },
        { id: 'bedside_table', name: 'Bedside table', price: 350, w: .8, d: .8, h: .8, style: 'cabinet', surface: { w: .7, d: .7, y: .8 }, color: '#9a7350' },
        { id: 'laundry_basket', name: 'Laundry basket', price: 120, w: .6, d: .6, h: .8, style: 'basket', color: '#b7a07a' },
        { id: 'standing_mirror', name: 'Standing mirror', price: 450, w: .8, d: .4, h: 2, style: 'mirror', color: '#c9c3b8' },

        // --- Dining & kitchen ---
        { id: 'round_table', name: 'Round dining table', price: 850, w: 1.8, d: 1.8, h: 1.1, style: 'round_table', surface: { w: 1.6, d: 1.6, y: 1.1 }, color: '#a67b52', section: 'Dining & kitchen' },
        { id: 'bar_table', name: 'Bar table', price: 700, w: 1.4, d: 1.4, h: 1.6, style: 'round_table', surface: { w: 1.2, d: 1.2, y: 1.6 }, color: '#7c5b40' },
        { id: 'bar_stool', name: 'Bar stool', price: 220, w: .6, d: .6, h: 1.5, style: 'stool', color: '#8c6a4a' },
        { id: 'dining_chair', name: 'Dining chair', price: 300, w: .9, d: .9, h: 1.5, style: 'chair', color: '#966f4b' },
        { id: 'bench', name: 'Bench', price: 400, w: 1.8, d: .7, h: .9, style: 'bench', color: '#8f6544' },
        { id: 'kitchen_counter', name: 'Kitchen counter', price: 1300, w: 2.4, d: 1, h: 1.4, style: 'counter', surface: { w: 2.2, d: .9, y: 1.4 }, color: '#b9a98f' },
        { id: 'kitchen_island', name: 'Kitchen island', price: 1800, w: 2, d: 1.4, h: 1.4, style: 'counter', surface: { w: 1.8, d: 1.3, y: 1.4 }, color: '#b29b76' },
        { id: 'fridge', name: 'Refrigerator', price: 1500, w: 1.2, d: .9, h: 2.4, style: 'cabinet', color: '#d8dde0' },
        { id: 'stove', name: 'Stove', price: 1100, w: 1, d: .9, h: 1.3, style: 'stove', color: '#4d5358' },

        // --- Study ---
        { id: 'office_chair', name: 'Office chair', price: 500, w: .9, d: .9, h: 1.5, style: 'office_chair', color: '#4f5b66', section: 'Study' },
        { id: 'executive_desk', name: 'Executive desk', price: 1800, w: 2.6, d: 1.2, h: 1.4, style: 'table', surface: { w: 2.4, d: 1.1, y: 1.4 }, color: '#5e4634' },
        { id: 'filing_cabinet', name: 'Filing cabinet', price: 650, w: .8, d: .8, h: 1.5, style: 'cabinet', surface: { w: .7, d: .7, y: 1.5 }, color: '#7d838a' },
        { id: 'desk_lamp', name: 'Desk lamp', price: 180, w: .4, d: .4, h: .8, style: 'lamp', stackable: true, color: '#e0c27a' },
        { id: 'globe', name: 'Globe', price: 220, w: .6, d: .6, h: .9, style: 'globe', color: '#5f88a8' },
        { id: 'wall_shelf', name: 'Wall shelf', price: 400, w: 1.6, d: .5, h: 1.4, style: 'shelf', surface: { w: 1.4, d: .4, y: 1.4 }, color: '#8f6b46' },
        { id: 'corkboard', name: 'Corkboard', price: 160, w: 1.2, d: .2, h: .9, style: 'board', color: '#b08a5c' },
        { id: 'typewriter', name: 'Typewriter', price: 300, w: .7, d: .6, h: .4, style: 'typewriter', stackable: true, color: '#3f4247' },

        // --- Bathroom ---
        { id: 'bathtub', name: 'Bathtub', price: 1700, w: 2.2, d: 1.2, h: 1.2, style: 'bathtub', color: '#e6e2d8', section: 'Bathroom' },
        { id: 'shower', name: 'Shower', price: 1300, w: 1.8, d: 1.8, h: 3.2, style: 'shower', color: '#aebfc7' },
        { id: 'toilet', name: 'Toilet', price: 600, w: .8, d: .9, h: 1.2, style: 'toilet', color: '#e8e6df' },
        { id: 'sink', name: 'Sink', price: 550, w: 1, d: .6, h: 1.2, style: 'sink', color: '#e3e0d6' },
        { id: 'bathroom_cabinet', name: 'Bathroom cabinet', price: 700, w: .9, d: .6, h: 1.6, style: 'cabinet', surface: { w: .8, d: .5, y: 1.6 }, color: '#b8c0bd' },
        { id: 'bath_mat', name: 'Bath mat', price: 90, w: 1.2, d: .8, h: .02, style: 'rug', rug: true, color: '#9fc0bd' },

        // --- Lighting & decor ---
        { id: 'floor_lamp', name: 'Floor lamp', price: 450, w: .5, d: .5, h: 1.8, style: 'lamp', color: '#d8c08a', section: 'Lighting & decor' },
        { id: 'arc_lamp', name: 'Arc lamp', price: 700, w: 1.2, d: 1, h: 2, style: 'arc_lamp', color: '#c9b07b' },
        { id: 'candlesticks', name: 'Candlestick set', price: 80, w: .3, d: .3, h: .5, style: 'candles', stackable: true, color: '#d9c9a0' },
        { id: 'grandfather_clock', name: 'Grandfather clock', price: 1400, w: .7, d: .5, h: 2.4, style: 'clock', color: '#6d4b33' },
        { id: 'desk_clock', name: 'Desk clock', price: 180, w: .3, d: .3, h: .4, style: 'clock', stackable: true, color: '#8a6b4b' },
        { id: 'sculpture', name: 'Sculpture', price: 600, w: .6, d: .6, h: 1.4, style: 'sculpture', color: '#8f9aa5' },
        { id: 'pedestal', name: 'Pedestal', price: 300, w: .6, d: .6, h: 1, style: 'pedestal', surface: { w: .5, d: .5, y: 1 }, color: '#cfc7b8' },
        { id: 'folding_screen', name: 'Folding screen', price: 550, w: 2, d: .3, h: 2, style: 'screen', color: '#a87d5b' },
        { id: 'coat_rack', name: 'Coat rack', price: 250, w: .6, d: .6, h: 1.9, style: 'coat_rack', color: '#7a5c3f' },
        { id: 'towel_rack', name: 'Towel rack', price: 140, w: .9, d: .3, h: 1.4, style: 'towel_rack', color: '#a9a39a' },

        // --- Plants ---
        { id: 'monstera', name: 'Monstera', price: 280, w: .7, d: .7, h: 1.4, style: 'plant', color: '#4f8a5b', section: 'Plants' },
        { id: 'fern', name: 'Fern', price: 140, w: .5, d: .5, h: .8, style: 'plant', color: '#5f9a62' },
        { id: 'cactus', name: 'Cactus', price: 110, w: .4, d: .4, h: .7, style: 'plant', color: '#6b9a5e' },
        { id: 'bonsai', name: 'Bonsai', price: 260, w: .4, d: .4, h: .6, style: 'bonsai', stackable: true, color: '#7d9a5b' },
        { id: 'bouquet', name: 'Flower bouquet', price: 130, w: .4, d: .4, h: .7, style: 'bouquet', stackable: true, color: '#d98ca0' },

        // --- Rugs ---
        { id: 'round_rug', name: 'Round rug', price: 380, w: 3.5, d: 3.5, h: .02, style: 'rug', rug: true, color: '#b58a6b', section: 'Rugs' },
        { id: 'runner_rug', name: 'Runner rug', price: 260, w: 4, d: 1.5, h: .02, style: 'rug', rug: true, color: '#8f6f5a' },
        { id: 'fur_rug', name: 'Fur rug', price: 450, w: 2.5, d: 2, h: .03, style: 'rug', rug: true, color: '#d8c9b5' }
    ];
    // Additional household pieces use the same bounded, saved furniture protocol.
    catalog.push(...[
    {
        "id": "velvet_sofa",
        "name": "Plum velvet sofa",
        "price": 2300,
        "w": 2.8,
        "d": 1.4,
        "h": 1.4,
        "style": "upholstered",
        "color": "#734b75",
        "section": "Living room"
    },
    {
        "id": "linen_loveseat",
        "name": "Linen loveseat",
        "price": 1400,
        "w": 1.8,
        "d": 1.2,
        "h": 1.2,
        "style": "upholstered",
        "color": "#e1cfad",
        "section": "Living room"
    },
    {
        "id": "reading_chair",
        "name": "Forest reading chair",
        "price": 850,
        "w": 1.1,
        "d": 1.2,
        "h": 1.4,
        "style": "upholstered",
        "color": "#456e5a",
        "section": "Living room"
    },
    {
        "id": "leather_ottoman",
        "name": "Leather footstool",
        "price": 420,
        "w": 0.9,
        "d": 0.8,
        "h": 0.5,
        "style": "ottoman",
        "color": "#995e3d",
        "section": "Living room"
    },
    {
        "id": "glass_coffee_table",
        "name": "Glass-top coffee table",
        "price": 1100,
        "w": 2,
        "d": 1.1,
        "h": 0.7,
        "style": "table",
        "color": "#92c4ce",
        "section": "Living room",
        "surface": {
            "w": 1.9,
            "d": 1,
            "y": 0.7
        }
    },
    {
        "id": "record_console",
        "name": "Record storage console",
        "price": 950,
        "w": 1.8,
        "d": 0.7,
        "h": 1,
        "style": "cabinet",
        "color": "#a16d45",
        "section": "Living room",
        "surface": {
            "w": 1.6500000000000001,
            "d": 0.6,
            "y": 1
        }
    },
    {
        "id": "entry_bench",
        "name": "Entryway bench",
        "price": 520,
        "w": 1.6,
        "d": 0.7,
        "h": 0.85,
        "style": "bench",
        "color": "#b59a72",
        "section": "Living room"
    },
    {
        "id": "shoe_cabinet",
        "name": "Shoe cabinet",
        "price": 650,
        "w": 1.4,
        "d": 0.5,
        "h": 1.1,
        "style": "cabinet",
        "color": "#ede2ca",
        "section": "Living room",
        "surface": {
            "w": 1.25,
            "d": 0.4,
            "y": 1.1
        }
    },
    {
        "id": "canopy_bed",
        "name": "Canopy bed",
        "price": 4200,
        "w": 2.5,
        "d": 3.2,
        "h": 3.5,
        "style": "canopy",
        "color": "#a385a1",
        "section": "Bedroom"
    },
    {
        "id": "rustic_bed",
        "name": "Rustic pine bed",
        "price": 1800,
        "w": 2,
        "d": 2.8,
        "h": 1.3,
        "style": "bed",
        "color": "#bb9569",
        "section": "Bedroom"
    },
    {
        "id": "mint_bed",
        "name": "Mint quilt bed",
        "price": 1700,
        "w": 1.8,
        "d": 2.6,
        "h": 1.2,
        "style": "bed",
        "color": "#93b9ac",
        "section": "Bedroom"
    },
    {
        "id": "walnut_wardrobe",
        "name": "Walnut wardrobe",
        "price": 1900,
        "w": 2,
        "d": 0.8,
        "h": 2.8,
        "style": "cabinet",
        "color": "#664a3b",
        "section": "Bedroom",
        "surface": {
            "w": 1.85,
            "d": 0.7000000000000001,
            "y": 2.8
        }
    },
    {
        "id": "white_dresser",
        "name": "Ivory chest of drawers",
        "price": 1300,
        "w": 1.6,
        "d": 0.8,
        "h": 1.2,
        "style": "cabinet",
        "color": "#e8dfca",
        "section": "Bedroom",
        "surface": {
            "w": 1.4500000000000002,
            "d": 0.7000000000000001,
            "y": 1.2
        }
    },
    {
        "id": "luggage_trunk",
        "name": "Travel trunk",
        "price": 700,
        "w": 1.4,
        "d": 0.8,
        "h": 0.8,
        "style": "trunk",
        "color": "#836647",
        "section": "Bedroom",
        "surface": {
            "w": 1.25,
            "d": 0.7000000000000001,
            "y": 0.8
        }
    },
    {
        "id": "blanket_basket",
        "name": "Blanket basket",
        "price": 220,
        "w": 0.7,
        "d": 0.7,
        "h": 0.65,
        "style": "basket",
        "color": "#c5a67f",
        "section": "Bedroom"
    },
    {
        "id": "dressing_stool",
        "name": "Dressing stool",
        "price": 260,
        "w": 0.7,
        "d": 0.7,
        "h": 0.7,
        "style": "stool",
        "color": "#c695aa",
        "section": "Bedroom"
    },
    {
        "id": "microwave",
        "name": "Microwave oven",
        "price": 550,
        "w": 0.8,
        "d": 0.5,
        "h": 0.5,
        "style": "microwave",
        "color": "#c6cbd0",
        "section": "Dining & kitchen",
        "stackable": true
    },
    {
        "id": "coffee_machine",
        "name": "Coffee machine",
        "price": 420,
        "w": 0.45,
        "d": 0.5,
        "h": 0.65,
        "style": "coffee_machine",
        "color": "#45414a",
        "section": "Dining & kitchen",
        "stackable": true
    },
    {
        "id": "toaster",
        "name": "Two-slice toaster",
        "price": 180,
        "w": 0.5,
        "d": 0.35,
        "h": 0.35,
        "style": "toaster",
        "color": "#d79b75",
        "section": "Dining & kitchen",
        "stackable": true
    },
    {
        "id": "kettle",
        "name": "Enamel kettle",
        "price": 140,
        "w": 0.4,
        "d": 0.4,
        "h": 0.5,
        "style": "kettle",
        "color": "#75a6ab",
        "section": "Dining & kitchen",
        "stackable": true
    },
    {
        "id": "dishwasher",
        "name": "Dishwasher",
        "price": 1000,
        "w": 1,
        "d": 0.9,
        "h": 1.3,
        "style": "dishwasher",
        "color": "#b9c1c6",
        "section": "Dining & kitchen"
    },
    {
        "id": "butcher_block",
        "name": "Butcher-block counter",
        "price": 1450,
        "w": 1.8,
        "d": 1,
        "h": 1.4,
        "style": "counter",
        "color": "#ab8158",
        "section": "Dining & kitchen",
        "surface": {
            "w": 1.7,
            "d": 0.9,
            "y": 1.4
        }
    },
    {
        "id": "pantry",
        "name": "Pantry cupboard",
        "price": 1700,
        "w": 1.5,
        "d": 0.8,
        "h": 2.6,
        "style": "cabinet",
        "color": "#c7b08b",
        "section": "Dining & kitchen",
        "surface": {
            "w": 1.35,
            "d": 0.7000000000000001,
            "y": 2.6
        }
    },
    {
        "id": "breakfast_table",
        "name": "Breakfast table",
        "price": 650,
        "w": 1.4,
        "d": 1,
        "h": 1.1,
        "style": "table",
        "color": "#dfd1b4",
        "section": "Dining & kitchen",
        "surface": {
            "w": 1.2999999999999998,
            "d": 0.9,
            "y": 1.1
        }
    },
    {
        "id": "fruit_bowl",
        "name": "Fruit bowl",
        "price": 120,
        "w": 0.5,
        "d": 0.5,
        "h": 0.3,
        "style": "fruit_bowl",
        "color": "#b67948",
        "section": "Dining & kitchen",
        "stackable": true
    },
    {
        "id": "plate_stack",
        "name": "Stack of plates",
        "price": 80,
        "w": 0.4,
        "d": 0.4,
        "h": 0.18,
        "style": "plates",
        "color": "#e8e2d2",
        "section": "Dining & kitchen",
        "stackable": true
    },
    {
        "id": "double_vanity",
        "name": "Double bathroom vanity",
        "price": 2100,
        "w": 2.4,
        "d": 0.8,
        "h": 1.2,
        "style": "double_sink",
        "color": "#b1bbb8",
        "section": "Bathroom"
    },
    {
        "id": "bathroom_stool",
        "name": "Bamboo bath stool",
        "price": 180,
        "w": 0.6,
        "d": 0.6,
        "h": 0.65,
        "style": "stool",
        "color": "#c0a875",
        "section": "Bathroom"
    },
    {
        "id": "towel_basket",
        "name": "Rolled towel basket",
        "price": 150,
        "w": 0.6,
        "d": 0.5,
        "h": 0.5,
        "style": "basket",
        "color": "#a6b8ba",
        "section": "Bathroom"
    },
    {
        "id": "hamper",
        "name": "Linen hamper",
        "price": 240,
        "w": 0.7,
        "d": 0.6,
        "h": 1,
        "style": "basket",
        "color": "#c2b49b",
        "section": "Bathroom"
    },
    {
        "id": "soap_set",
        "name": "Soap and lotion set",
        "price": 90,
        "w": 0.4,
        "d": 0.3,
        "h": 0.35,
        "style": "bottles",
        "color": "#9ebcaf",
        "section": "Bathroom",
        "stackable": true
    },
    {
        "id": "bathroom_mirror",
        "name": "Oval dressing mirror",
        "price": 520,
        "w": 1,
        "d": 0.4,
        "h": 1.8,
        "style": "mirror",
        "color": "#d7c8a2",
        "section": "Bathroom"
    },
    {
        "id": "compact_desk",
        "name": "Compact study desk",
        "price": 650,
        "w": 1.6,
        "d": 0.8,
        "h": 1.2,
        "style": "table",
        "color": "#b79b7d",
        "section": "Study",
        "surface": {
            "w": 1.5,
            "d": 0.7000000000000001,
            "y": 1.2
        }
    },
    {
        "id": "oak_bookcase",
        "name": "Tall oak bookcase",
        "price": 1500,
        "w": 1.6,
        "d": 0.7,
        "h": 2.8,
        "style": "shelf",
        "color": "#94704e",
        "section": "Study",
        "surface": {
            "w": 1.4500000000000002,
            "d": 0.6,
            "y": 2.8
        }
    },
    {
        "id": "metal_shelving",
        "name": "Industrial shelving",
        "price": 1000,
        "w": 2,
        "d": 0.6,
        "h": 2.4,
        "style": "shelf",
        "color": "#606b72",
        "section": "Study",
        "surface": {
            "w": 1.85,
            "d": 0.5,
            "y": 2.4
        }
    },
    {
        "id": "desktop_computer",
        "name": "Desktop computer",
        "price": 1100,
        "w": 1,
        "d": 0.5,
        "h": 0.8,
        "style": "computer",
        "color": "#393f49",
        "section": "Study",
        "stackable": true
    },
    {
        "id": "desk_organizer",
        "name": "Desk organizer",
        "price": 100,
        "w": 0.4,
        "d": 0.3,
        "h": 0.3,
        "style": "organizer",
        "color": "#a67c50",
        "section": "Study",
        "stackable": true
    },
    {
        "id": "reading_lamp",
        "name": "Emerald reading lamp",
        "price": 240,
        "w": 0.4,
        "d": 0.4,
        "h": 0.7,
        "style": "lamp",
        "color": "#5f8a72",
        "section": "Study",
        "stackable": true
    },
    {
        "id": "fiddle_leaf",
        "name": "Fiddle-leaf fig",
        "price": 420,
        "w": 0.9,
        "d": 0.9,
        "h": 2.2,
        "style": "plant",
        "color": "#58845e",
        "section": "Plants"
    },
    {
        "id": "olive_tree",
        "name": "Indoor olive tree",
        "price": 600,
        "w": 1,
        "d": 1,
        "h": 2.6,
        "style": "plant",
        "color": "#87936a",
        "section": "Plants"
    },
    {
        "id": "snake_plant",
        "name": "Snake plant",
        "price": 190,
        "w": 0.5,
        "d": 0.5,
        "h": 1.1,
        "style": "plant",
        "color": "#668653",
        "section": "Plants"
    },
    {
        "id": "pink_orchid",
        "name": "Pink orchid",
        "price": 240,
        "w": 0.5,
        "d": 0.5,
        "h": 0.85,
        "style": "bouquet",
        "color": "#d59bb5",
        "section": "Plants",
        "stackable": true
    },
    {
        "id": "succulent_tray",
        "name": "Succulent arrangement",
        "price": 180,
        "w": 0.6,
        "d": 0.4,
        "h": 0.35,
        "style": "bonsai",
        "color": "#89a579",
        "section": "Plants",
        "stackable": true
    },
    {
        "id": "dried_flowers",
        "name": "Dried flower vase",
        "price": 160,
        "w": 0.5,
        "d": 0.5,
        "h": 0.9,
        "style": "bouquet",
        "color": "#c5a780",
        "section": "Plants",
        "stackable": true
    },
    {
        "id": "navy_rug",
        "name": "Navy geometric rug",
        "price": 550,
        "w": 3,
        "d": 2,
        "h": 0.025,
        "style": "rug",
        "color": "#465a80",
        "section": "Rugs",
        "rug": true
    },
    {
        "id": "sage_rug",
        "name": "Sage woven rug",
        "price": 480,
        "w": 3,
        "d": 2,
        "h": 0.025,
        "style": "rug",
        "color": "#85967b",
        "section": "Rugs",
        "rug": true
    },
    {
        "id": "rose_rug",
        "name": "Rose patterned rug",
        "price": 600,
        "w": 3.5,
        "d": 2.5,
        "h": 0.025,
        "style": "rug",
        "color": "#ba8296",
        "section": "Rugs",
        "rug": true
    },
    {
        "id": "cream_runner",
        "name": "Cream hallway runner",
        "price": 320,
        "w": 4,
        "d": 1,
        "h": 0.025,
        "style": "rug",
        "color": "#ddceb0",
        "section": "Rugs",
        "rug": true
    },
    {
        "id": "sunset_rug",
        "name": "Sunset striped rug",
        "price": 500,
        "w": 3,
        "d": 2,
        "h": 0.025,
        "style": "rug",
        "color": "#c78758",
        "section": "Rugs",
        "rug": true
    },
    {
        "id": "blue_bath_rug",
        "name": "Ocean bath rug",
        "price": 130,
        "w": 1.5,
        "d": 1,
        "h": 0.025,
        "style": "rug",
        "color": "#6aabb6",
        "section": "Rugs",
        "rug": true
    },
    {
        "id": "upright_piano",
        "name": "Upright piano",
        "price": 4500,
        "w": 2,
        "d": 0.8,
        "h": 1.8,
        "style": "piano",
        "color": "#584138",
        "section": "Hobbies & games"
    },
    {
        "id": "digital_keyboard",
        "name": "Digital keyboard",
        "price": 1900,
        "w": 1.8,
        "d": 0.7,
        "h": 1.2,
        "style": "keyboard",
        "color": "#454855",
        "section": "Hobbies & games"
    },
    {
        "id": "guitar_stand",
        "name": "Acoustic guitar and stand",
        "price": 850,
        "w": 0.7,
        "d": 0.6,
        "h": 1.8,
        "style": "guitar",
        "color": "#bf8b50",
        "section": "Hobbies & games"
    },
    {
        "id": "chess_table",
        "name": "Chess table",
        "price": 900,
        "w": 1.2,
        "d": 1.2,
        "h": 1.1,
        "style": "chess",
        "color": "#946c4b",
        "section": "Hobbies & games",
        "surface": {
            "w": 1.05,
            "d": 1.0999999999999999,
            "y": 1.1
        }
    },
    {
        "id": "board_game_stack",
        "name": "Board game stack",
        "price": 140,
        "w": 0.6,
        "d": 0.5,
        "h": 0.3,
        "style": "game_boxes",
        "color": "#bd7e5a",
        "section": "Hobbies & games",
        "stackable": true
    },
    {
        "id": "record_player",
        "name": "Record player",
        "price": 600,
        "w": 0.7,
        "d": 0.5,
        "h": 0.35,
        "style": "record_player",
        "color": "#99704e",
        "section": "Hobbies & games",
        "stackable": true
    },
    {
        "id": "sewing_machine",
        "name": "Sewing machine",
        "price": 550,
        "w": 0.6,
        "d": 0.4,
        "h": 0.55,
        "style": "sewing",
        "color": "#b5c0bd",
        "section": "Hobbies & games",
        "stackable": true
    },
    {
        "id": "easel",
        "name": "Painting easel",
        "price": 750,
        "w": 1,
        "d": 0.7,
        "h": 2,
        "style": "easel",
        "color": "#af8d61",
        "section": "Hobbies & games"
    },
    {
        "id": "washing_machine",
        "name": "Washing machine",
        "price": 1600,
        "w": 1.1,
        "d": 1,
        "h": 1.4,
        "style": "washer",
        "color": "#d9ddd7",
        "section": "Laundry & utility"
    },
    {
        "id": "tumble_dryer",
        "name": "Tumble dryer",
        "price": 1500,
        "w": 1.1,
        "d": 1,
        "h": 1.4,
        "style": "washer",
        "color": "#b9c4ca",
        "section": "Laundry & utility"
    },
    {
        "id": "ironing_board",
        "name": "Ironing board",
        "price": 350,
        "w": 1.8,
        "d": 0.6,
        "h": 1.1,
        "style": "ironing",
        "color": "#9cb8c0",
        "section": "Laundry & utility"
    },
    {
        "id": "wicker_laundry_basket",
        "name": "Wicker laundry basket",
        "price": 120,
        "w": 0.8,
        "d": 0.6,
        "h": 0.55,
        "style": "basket",
        "color": "#cbbda1",
        "section": "Laundry & utility"
    },
    {
        "id": "cleaning_caddy",
        "name": "Cleaning supply caddy",
        "price": 100,
        "w": 0.5,
        "d": 0.4,
        "h": 0.5,
        "style": "bottles",
        "color": "#8eaab2",
        "section": "Laundry & utility",
        "stackable": true
    },
    {
        "id": "utility_cabinet",
        "name": "Utility cupboard",
        "price": 800,
        "w": 1,
        "d": 0.7,
        "h": 2.2,
        "style": "cabinet",
        "color": "#a4b4a6",
        "section": "Laundry & utility",
        "surface": {
            "w": 0.85,
            "d": 0.6,
            "y": 2.2
        }
    },
    {
        "id": "fishing_rod_rack",
        "name": "Decorative fishing rod rack",
        "price": 900,
        "w": 1.5,
        "d": 0.5,
        "h": 2.4,
        "style": "rod_rack",
        "color": "#a47c50",
        "section": "Coastal decor"
    },
    {
        "id": "tackle_chest",
        "name": "Tackle chest",
        "price": 450,
        "w": 1,
        "d": 0.6,
        "h": 0.65,
        "style": "trunk",
        "color": "#668d88",
        "section": "Coastal decor",
        "surface": {
            "w": 0.85,
            "d": 0.5,
            "y": 0.65
        }
    },
    {
        "id": "model_sailboat",
        "name": "Model sailboat",
        "price": 350,
        "w": 0.7,
        "d": 0.4,
        "h": 0.8,
        "style": "sailboat",
        "color": "#d3c6a3",
        "section": "Coastal decor",
        "stackable": true
    },
    {
        "id": "shell_display",
        "name": "Seashell display",
        "price": 160,
        "w": 0.5,
        "d": 0.4,
        "h": 0.25,
        "style": "shells",
        "color": "#e2c9b1",
        "section": "Coastal decor",
        "stackable": true
    },
    {
        "id": "lighthouse_model",
        "name": "Lighthouse model",
        "price": 300,
        "w": 0.4,
        "d": 0.4,
        "h": 0.85,
        "style": "lighthouse",
        "color": "#d6c7b4",
        "section": "Coastal decor",
        "stackable": true
    },
    {
        "id": "fish_sculpture",
        "name": "Wooden fish sculpture",
        "price": 380,
        "w": 0.8,
        "d": 0.3,
        "h": 0.5,
        "style": "fish_sculpture",
        "color": "#a68556",
        "section": "Coastal decor",
        "stackable": true
    },
    {
        "id": "rope_basket",
        "name": "Rope storage basket",
        "price": 170,
        "w": 0.7,
        "d": 0.7,
        "h": 0.65,
        "style": "basket",
        "color": "#c7b891",
        "section": "Coastal decor"
    },
    {
        "id": "coastal_lantern",
        "name": "Coastal lantern",
        "price": 260,
        "w": 0.4,
        "d": 0.4,
        "h": 0.7,
        "style": "lantern",
        "color": "#8b9e9c",
        "section": "Coastal decor",
        "stackable": true
    }
]);
    const collections=[
        {id:'lake',name:'Lakeside Life',fish:['Bluegill','Yellow Perch','Common Carp'],reward:'collection_lake_bench',title:'lake_collector'},
        {id:'pond',name:'Pond Jewels',fish:['Guppy','Neon Tetra','Goldfish'],reward:'collection_pond_lamp',title:'pond_collector'},
        {id:'angler',name:'Freshwater Angler',fish:['Largemouth Bass','Rainbow Trout','Channel Catfish'],reward:'collection_angler_cabinet',title:'angler_collector'}
    ];
    catalog.push(
        {id:'catch_plaque',name:'Catch display plaque',price:800,w:1.6,d:.2,h:.9,wall:true,mountY:2.2,style:'catch_plaque',color:'#a47a50',section:'Catch displays'},
        {id:'collection_lake_bench',name:'Lakeside collector bench',price:1400,w:2,d:.8,h:.9,style:'bench',color:'#5f9891',collection:'lake',section:'Collection rewards'},
        {id:'collection_pond_lamp',name:'Pond jewel lamp',price:700,w:.5,d:.5,h:.9,style:'lamp',color:'#b789c5',stackable:true,collection:'pond',section:'Collection rewards'},
        {id:'collection_angler_cabinet',name:'Angler tackle cabinet',price:1800,w:1.6,d:.7,h:1.3,style:'cabinet',color:'#799667',collection:'angler',section:'Collection rewards'}
    );
    const collectionProgress=(house,journal)=>collections.map(entry=>({...entry,count:entry.fish.filter(name=>Array.isArray(journal?.[name])&&journal[name].length>0).length,claimed:(house.collections||[]).includes(entry.id)}));
    function claimCollection(house,journal,id){
        const entry=collectionProgress(house,journal).find(v=>v.id===id);
        if(!entry||entry.claimed||entry.count!==entry.fish.length)return {ok:false,error:'Complete this collection before claiming it.'};
        if(house.inventory.length>=STORAGE_LIMIT)return {ok:false,error:'Make room in furniture storage first.'};
        return {ok:true,title:entry.title,house:{...copy(house),collections:[...(house.collections||[]),id],inventory:[...copy(house.inventory),{id:'reward-'+id,type:entry.reward}]}};
    }
    function transferCatch(house,inventory,itemId,index=null){
        const item=house.furniture.find(v=>v.id===itemId);
        if(!item||!['aquarium','catch_plaque'].includes(item.type))return {ok:false,error:'Catch display not found.'};
        const fishInventory=copy(inventory),next={...item};
        if(index!==null){
            if(!Number.isInteger(index)||!inventory[index]||inventory[index].name==='Old Boot')return {ok:false,error:'That fish is no longer in your inventory.'};
            next.displayCatch=itemMetadata({displayCatch:inventory[index]}).displayCatch;
            if(!next.displayCatch)return {ok:false,error:'Select an inventory fish.'};
            next.displayOwned=true;fishInventory.splice(index,1);
        }else{delete next.displayCatch;delete next.displayOwned;}
        if(item.displayOwned&&item.displayCatch)fishInventory.push(copy(item.displayCatch));
        return {ok:true,house:{...copy(house),furniture:house.furniture.map(v=>v.id===itemId?next:copy(v))},fishInventory};
    }
    function itemMetadata(value){
        const out={};if(/^#[0-9a-f]{6}$/i.test(value?.color))out.color=value.color;
        const fish=value?.displayCatch;
        if(fish&&typeof fish.name==='string'&&fish.name!=='Old Boot')out.displayCatch={name:fish.name.slice(0,48),color:/^#[0-9a-f]{6}$/i.test(fish.color)?fish.color:'#a9c9a5',size:Number.isFinite(fish.size)?Math.max(.01,Math.min(100000,fish.size)):1,zone:typeof fish.zone==='string'?fish.zone.slice(0,24):'',tierName:typeof fish.tierName==='string'?fish.tierName.slice(0,24):'',tierId:typeof fish.tierId==='string'?fish.tierId.slice(0,24):'normal',rarity:typeof fish.rarity==='string'?fish.rarity.slice(0,24):'',sizeLabel:typeof fish.sizeLabel==='string'?fish.sizeLabel.slice(0,24):'',...Object.fromEntries(['price','basePrice','drain','drainRate'].filter(key=>Number.isFinite(fish[key])&&fish[key]>=0).map(key=>[key,fish[key]])),isLava:fish.isLava===true};
        if(out.displayCatch&&value.displayOwned===true)out.displayOwned=true;
        return out;
    }
    const catalogSections = [];
    let currentSection='Furniture';
    for (const item of catalog) {
        if(item.section)currentSection=item.section;
        let section=catalogSections.find(v=>v.name===currentSection);
        if(!section){section={name:currentSection,items:[]};catalogSections.push(section);}
        section.items.push(item);
    }
    const byId = Object.assign(Object.create(null), Object.fromEntries(catalog.map(v => [v.id, v])));
    // Heights above the item base that make a solid top landable. Items not in
    // this map stay full-height walls even while jumping, so a player can never
    // drop through a plant, lamp or tall cabinet.
    const standTops = Object.freeze({
        chair: .74, table: 1.2, coffee_table: .65, desk: 1.25, nightstand: .85, sofa: .9, bed: .74,
        armchair: .55, loveseat: .6, sectional: .65, ottoman: .48, recliner: .6, tv_stand: .6,
        console_table: .9, side_table: .7, twin_bed: .55, king_bed: .7, bunk_bed: .92,
        dresser: 1.1, vanity: 1.5, bedside_table: .8, round_table: 1.1, bar_table: 1.6,
        bar_stool: 1.5, dining_chair: .75, bench: .5, kitchen_counter: 1.4, kitchen_island: 1.4,
        office_chair: .74, executive_desk: 1.4, filing_cabinet: 1.5, bathroom_cabinet: 1.6
    });
    function standHeight(info) {
        if(!info)return undefined;
        if(standTops[info.id]!==undefined)return standTops[info.id];
        if(info.style==='upholstered')return info.h*.5;
        if(info.style==='bed')return info.h*.54;
        if(info.style==='canopy')return .76;
        if(info.style==='chair')return info.h*.525;
        if(info.style==='bench')return info.h*.56;
        if(info.style==='ottoman')return info.h*.82+.025;
        if(['table','counter','trunk','chess','stool','washer','dishwasher'].includes(info.style))return info.h;
        if(info.style==='ironing')return info.h*.98;
        if(info.style==='cabinet'&&info.h<=1.6&&!info.stackable)return info.h;
        return undefined;
    }

    const isScreenType = type => type === 'stream_tv' || type === 'wall_tv';
    const WALLS=['back','right','front','left'];
    const wallRotation = wall => wall === 'left' ? Math.PI / 2 : wall === 'right' ? -Math.PI / 2 : wall === 'front' ? Math.PI : 0;
    const snapValue = value => Math.round((Number.isFinite(value) ? value : 0) / STEP) * STEP;
    // Wall items are stored at the wall plane. `offset` runs along the wall.
    function wallPlacement(info, wall, offset, house) {
        const { width, depth } = roomSize(house);
        wall = WALLS.includes(wall) ? wall : 'back';
        const rot = wallRotation(wall);
        if (wall === 'back' || wall === 'front') {
            const max = Math.max(0, width / 2 - info.w / 2 - .1);
            return { x: Math.max(-max, Math.min(max, snapValue(Number.isFinite(offset) ? offset : 0))), z: (wall==='front'?1:-1)*(depth / 2 - info.d / 2), rot, support: null, wall };
        }
        const max = Math.max(0, depth / 2 - info.w / 2 - .1);
        return { x: wall === 'left' ? -(width / 2 - info.d / 2) : (width / 2 - info.d / 2), z: Math.max(-max, Math.min(max, snapValue(Number.isFinite(offset) ? offset : 0))), rot, support: null, wall };
    }
    // The stream field rides along with a placed/stored Flat-screen TV. Only a
    // validated provider and id are kept, so a house snapshot from another
    // player cannot inject arbitrary embed URLs.
    function cleanQueueItem(value) {
        if (!value || typeof value !== 'object') return null;
        const title = typeof value.title === 'string' ? value.title.replace(/[\x00-\x1f]/g, ' ').trim().slice(0, 120) : '';
        const addedBy = typeof value.addedBy === 'string' ? value.addedBy.replace(/[\x00-\x1f]/g, ' ').trim().slice(0, 40) : '';
        if (value.provider === 'youtube') {
            const id = typeof value.id === 'string' ? value.id.slice(0, 32) : '';
            if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
            return { provider: 'youtube', id, twitchKind: null, title, addedBy };
        }
        if (value.provider === 'twitch') {
            const id = typeof value.id === 'string' ? value.id.slice(0, 32) : '';
            const twitchKind = value.twitchKind === 'video' ? 'video' : 'channel';
            const ok = twitchKind === 'video' ? /^\d{1,20}$/.test(id) : /^[A-Za-z0-9_]{1,25}$/.test(id);
            if (!ok) return null;
            return { provider: 'twitch', id, twitchKind, title, addedBy };
        }
        return null;
    }
    function normalizeStream(value) {
        if (!value || typeof value !== 'object') return null;
        const startedAt = Number.isFinite(value.startedAt) ? value.startedAt : Date.now();
        const queue = (Array.isArray(value.queue) ? value.queue : []).slice(0, 50).map(cleanQueueItem).filter(Boolean);
        if (value.provider === 'youtube') {
            const videoId = typeof value.videoId === 'string' ? value.videoId.slice(0, 32) : '';
            if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
            return { provider: 'youtube', videoId, twitchId: null, twitchKind: null, startedAt, queue, ...(value.paused===true?{paused:true,pausedAt:Math.max(0,Math.min(1e7,Number(value.pausedAt)||0))}:{}) };
        }
        if (value.provider === 'twitch') {
            const twitchId = typeof value.twitchId === 'string' ? value.twitchId.slice(0, 32) : '';
            const twitchKind = value.twitchKind === 'video' ? 'video' : 'channel';
            const ok = twitchKind === 'video' ? /^\d{1,20}$/.test(twitchId) : /^[A-Za-z0-9_]{1,25}$/.test(twitchId);
            if (!ok) return null;
            return { provider: 'twitch', videoId: null, twitchId, twitchKind, startedAt, queue };
        }
        // A queue may exist before the first video starts.
        if (queue.length) return { provider: null, videoId: null, twitchId: null, twitchKind: null, startedAt, queue };
        return null;
    }
    const snap = value => Math.round((Number.isFinite(value) ? value : 0) / STEP) * STEP;
    const quarter = value => ((Math.round((Number.isFinite(value) ? value : 0) / (Math.PI / 2)) % 4) + 4) % 4;
    const rotation = value => quarter(value) * Math.PI / 2;
    const copy = value => JSON.parse(JSON.stringify(value));
    function footprint(item) {
        const info = byId[item.type], swap = quarter(item.rot) % 2, width = item.type === 'room_wall' ? wallLength(item) : info.w;
        return { x: item.x, z: item.z, w: swap ? info.d : width, d: swap ? width : info.d };
    }
    const overlap = (a, b, padding = 0) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + padding - .001 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + padding - .001;
    const isRoomPiece = type => type === 'room_wall' || type === 'room_doorway';
    const precise = value => Math.round((Number.isFinite(value) ? value : 0)*1000000)/1000000;
    const wallFriendly = type => ['dishwasher','butcher_block','pantry','double_vanity','compact_desk','oak_bookcase','metal_shelving','washing_machine','tumble_dryer','utility_cabinet','walnut_wardrobe','white_dresser','shoe_cabinet','record_console','kitchen_counter','kitchen_island','fridge','stove','sink','bathroom_cabinet','filing_cabinet','wardrobe','dresser','bookcase','desk','executive_desk'].includes(type);
    function snapToWall(items, item, house) {
        const base={...item,x:snap(item.x),z:snap(item.z),rot:rotation(item.rot)};
        if(!wallFriendly(item.type)||item.support)return base;
        const fp=footprint(base),size=roomSize(house),xs=[base.x],zs=[base.z],candidates=[];
        const rawX=Number.isFinite(item.x)?item.x:0,rawZ=Number.isFinite(item.z)?item.z:0;
        for(const side of [-1,1]){xs.push(side*(size.width/2-fp.w/2));zs.push(side*(size.depth/2-fp.d/2));}
        const add=(x,z)=>{
            const candidate={...base,x:precise(x),z:precise(z)},distance=Math.hypot(x-rawX,z-rawZ);
            if(distance<=.65&&!validate(items,candidate,house))candidates.push({candidate,distance});
        };
        for(const x of xs)for(const z of zs)if(x!==base.x||z!==base.z)add(x,z);
        for(const other of items){
            if(other.id===item.id||other.support||!(isRoomPiece(other.type)||wallFriendly(other.type)))continue;
            const rect=footprint(other);
            for(const side of [-1,1]){
                if(Math.abs(base.z-rect.z)<(fp.d+rect.d)/2) add(rect.x+side*(rect.w+fp.w)/2,base.z);
                if(Math.abs(base.x-rect.x)<(fp.w+rect.w)/2) add(base.x,rect.z+side*(rect.d+fp.d)/2);
            }
        }
        candidates.sort((a,b)=>a.distance-b.distance);
        return candidates[0]?.candidate||base;
    }
    function snapRoomPiece(items, item, house) {
        const base = { ...item, x: snap(item.x), z: snap(item.z), rot: rotation(item.rot), support: null };
        if (!isRoomPiece(item.type)) return base;
        const fp = footprint(base), size = roomSize(house), candidates = [];
        const rawX = Number.isFinite(item.x) ? item.x : 0, rawZ = Number.isFinite(item.z) ? item.z : 0;
        const add = (x,z) => {
            const candidate = { ...base, x: precise(x), z: precise(z) };
            const distance = Math.hypot(candidate.x-rawX,candidate.z-rawZ);
            if (distance <= .8 && !validate(items,candidate,house)) candidates.push({ candidate, distance });
        };
        for (const side of [-1,1]) {
            add(side*(size.width/2-fp.w/2),base.z);
            add(base.x,side*(size.depth/2-fp.d/2));
        }
        for (const other of items) {
            if (other.id === item.id || !isRoomPiece(other.type)) continue;
            const rect = footprint(other);
            for (const side of [-1,1]) {
                for (const z of [rect.z,rect.z+(rect.d-fp.d)/2,rect.z-(rect.d-fp.d)/2]) add(rect.x+side*(rect.w+fp.w)/2,z);
                for (const x of [rect.x,rect.x+(rect.w-fp.w)/2,rect.x-(rect.w-fp.w)/2]) add(x,rect.z+side*(rect.d+fp.d)/2);
            }
        }
        candidates.sort((a,b)=>a.distance-b.distance);
        return candidates[0]?.candidate || base;
    }
    function resolve(items, item) {
        const info = byId[item.type];
        if (info && info.wall) return { x: item.x, z: item.z, y: info.mountY || 0, rot: rotation(item.rot) };
        const parent = item.support && items.find(v => v.id === item.support);
        if (!parent) return { x: item.x, z: item.z, y: 0, rot: rotation(item.rot) };
        const r = rotation(parent.rot), c = Math.cos(r), s = Math.sin(r);
        return { x: parent.x + item.x * c + item.z * s, z: parent.z - item.x * s + item.z * c, y: byId[parent.type].surface.y, rot: rotation(item.rot + r) };
    }
    function validate(items, item, house) {
        const { width, depth } = roomSize(house);
        const info = byId[item.type];
        if (!info) return 'Unknown furniture.';
        if (info.wall) {
            if (!WALLS.includes(item.wall)) return 'Choose a wall.';
            if (quarter(item.rot) !== quarter(wallRotation(item.wall))) return 'Wall TVs follow the wall and cannot be rotated.';
            const fp = footprint(item);
            const along = (item.wall === 'back'||item.wall==='front') ? fp.x : fp.z;
            const max = (item.wall === 'back'||item.wall==='front') ? width / 2 : depth / 2;
            if (Math.abs(along) + info.w / 2 > max - .05) return 'Keep the TV inside the wall.';
            for (const other of items) {
                if (other.id === item.id) continue;
                const otherInfo = byId[other.type];
                if (!otherInfo || !otherInfo.wall || other.wall !== item.wall) continue;
                if (overlap(fp, footprint(other))) return 'Another wall TV is already there.';
            }
            return '';
        }
        const rect = footprint(item);
        if (item.support) {
            const parent = items.find(v => v.id === item.support);
            if (!info.stackable || !parent || parent.id === item.id || parent.support || !byId[parent.type]?.surface) return 'This item needs a valid table or shelf surface.';
            const surface = byId[parent.type].surface;
            if (Math.abs(rect.x) + rect.w / 2 > surface.w / 2 + .001 || Math.abs(rect.z) + rect.d / 2 > surface.d / 2 + .001) return 'The whole item must fit on the supporting surface.';
        } else {
            if (Math.abs(rect.x) + rect.w / 2 > width / 2 - (isRoomPiece(item.type) || wallFriendly(item.type) ? 0 : .5) + .001 || Math.abs(rect.z) + rect.d / 2 > depth / 2 - (isRoomPiece(item.type) || wallFriendly(item.type) ? 0 : .5) + .001) return 'Keep furniture inside the room.';
            if (!info.rug && overlap(rect, { x: 0, z: depth / 2 - 1.55, w: 2.5, d: 2.1 })) return 'Keep the doorway and arrival space clear.';
        }
        for (const other of items) {
            if (other.id === item.id || (other.support || null) !== (item.support || null)) continue;
            if (byId[other.type]?.wall) continue;
            if (info.rug || byId[other.type]?.rug) continue;
            if (overlap(rect, footprint(other))) return 'There is already an item in that space.';
        }
        return '';
    }
    function cleanItem(v, i, house) {
        const { width, depth } = roomSize(house);
        if (!v || typeof v.type !== 'string' || !byId[v.type]) return null;
        const info = byId[v.type];
        const id = typeof v.id === 'string' && v.id ? v.id.slice(0, 48) : 'item-' + i;
        if (info.wall) {
            const wall = WALLS.includes(v.wall) ? v.wall : 'back';
            const p = wallPlacement(info, wall, (wall === 'back'||wall==='front') ? v.x : v.z, house);
            const item = { id, type: v.type,...itemMetadata(v), x: p.x, z: p.z, rot: rotation(p.rot), support: null, wall };
            if (isScreenType(v.type)) { const stream = normalizeStream(v.stream); if (stream) item.stream = stream; }
            return item;
        }
        const item = { id, type: v.type,...itemMetadata(v),
            x: snap(Math.max(-width / 2 + 1, Math.min(width / 2 - 1, Number.isFinite(v.x) ? v.x : 0))), z: snap(Math.max(-depth / 2 + 1, Math.min(depth / 2 - 1, Number.isFinite(v.z) ? v.z : 0))),
            rot: rotation(v.rot), support: typeof v.support === 'string' ? v.support.slice(0, 48) : null };
        if (isRoomPiece(v.type)) {
            if (typeof v.roomId === 'string') item.roomId = v.roomId.slice(0,32);
            if (v.type === 'room_wall' && Number.isFinite(v.length)) item.length = wallLength(v);
            const fp = footprint(item);
            item.x = precise(Math.max(-width/2+fp.w/2,Math.min(width/2-fp.w/2,Number.isFinite(v.x)?v.x:0)));
            item.z = precise(Math.max(-depth/2+fp.d/2,Math.min(depth/2-fp.d/2,Number.isFinite(v.z)?v.z:0)));
        }
        if (wallFriendly(v.type) && !item.support) {
            const fp=footprint(item);
            item.x=precise(Math.max(-width/2+fp.w/2,Math.min(width/2-fp.w/2,Number.isFinite(v.x)?v.x:0)));
            item.z=precise(Math.max(-depth/2+fp.d/2,Math.min(depth/2-fp.d/2,Number.isFinite(v.z)?v.z:0)));
        }
        if (isScreenType(v.type)) { const stream = normalizeStream(v.stream); if (stream) item.stream = stream; }
        return item;
    }
    function normalizeLayout(raw, house) {
        const candidates = (Array.isArray(raw) ? raw : []).slice(0, 600).map((v,i) => cleanItem(v,i,house)).filter(Boolean);
        const out = [], ids = new Set();
        // Supports must exist before their children, regardless of incoming packet order.
        for (const item of [...candidates.filter(v => !v.support), ...candidates.filter(v => v.support)]) {
            if (capacityError({ ...house, furniture: out },item.type)) continue;
            if (isScreenType(item.type) && out.filter(v=>isScreenType(v.type)).length >= 2) continue;
            if (ids.has(item.id) || validate(out, item, house)) continue;
            ids.add(item.id); out.push(item);
        }
        return out;
    }
    function normalizeInventory(raw, placed) {
        const used = new Set(placed.map(v => v.id)), out = [];
        for (const value of (Array.isArray(raw) ? raw : []).slice(0, 600)) {
            if (out.length >= STORAGE_LIMIT) break;
            if (!value || typeof value.type!=='string' || !byId[value.type] || typeof value.id !== 'string' || !value.id || used.has(value.id.slice(0, 48))) continue;
            const id = value.id.slice(0, 48); used.add(id);
            const item = { id, type: value.type,...itemMetadata(value) };
            if (value.type === 'room_wall' && Number.isFinite(value.length)) item.length = wallLength(value);
            if (isScreenType(value.type)) { const stream = normalizeStream(value.stream); if (stream) item.stream = stream; }
            out.push(item);
        }
        return out;
    }
    const failure = error => ({ ok: false, error });
    function buy(house, money, type, id) {
        const info = byId[type];
        if (!info || typeof id !== 'string' || !id) return failure('Unknown furniture.');
        if(info.collection&&!(house.collections||[]).includes(info.collection))return failure('Complete the matching fishing collection first.');
        if (!Number.isFinite(money) || money < info.price) return failure('Not enough money.');
        
        if (house.inventory.length >= STORAGE_LIMIT) return failure('Furniture storage is full.');
        if ([...house.furniture, ...house.inventory].some(v => v.id === id)) return failure('That item already exists.');
        return { ok: true, money: money - info.price, house: { ...copy(house), inventory: [...copy(house.inventory), { id, type }] }, id };
    }
    function place(house, id, location) {
        const owned = house.inventory.find(v => v.id === id);
        if (!owned) return failure('Buy or select an owned item first.');
        const capacity=capacityError(house,owned.type);if(capacity)return failure(capacity);
        if(isScreenType(owned.type)&&house.furniture.filter(v=>isScreenType(v.type)).length>=2)return failure('A house can have at most 2 TVs.');
        const info = byId[owned.type];
        const item = { ...owned, support: location.support || null };
        if (item.type === 'room_wall' && Number.isFinite(location.length)) item.length = wallLength(location);
        if (info && info.wall) {
            const wall = WALLS.includes(location.wall) ? location.wall : 'back';
            const p = wallPlacement(info, wall, (wall === 'back'||wall==='front') ? location.x : location.z, house);
            item.x = p.x; item.z = p.z; item.rot = rotation(p.rot); item.wall = wall;
        } else {
            item.x = snap(location.x); item.z = snap(location.z); item.rot = rotation(location.rot);
        }
        if (isRoomPiece(item.type)) Object.assign(item, snapRoomPiece(house.furniture, { ...item, x: location.x, z: location.z }, house));
        if (wallFriendly(item.type)) Object.assign(item, snapToWall(house.furniture, { ...item, x: location.x, z: location.z }, house));
        const error = validate(house.furniture, item, house); if (error) return failure(error);
        return { ok: true, house: { ...copy(house), furniture: [...copy(house.furniture), item], inventory: copy(house.inventory.filter(v => v.id !== id)) } };
    }
    function move(house, id, location) {
        const old = house.furniture.find(v => v.id === id); if (!old) return failure('Select an item.');
        const info = byId[old.type];
        const item = { ...old, support: location.support || null };
        if (item.type === 'room_wall' && Number.isFinite(location.length)) item.length = wallLength(location);
        if (info && info.wall) {
            const wall = WALLS.includes(location.wall) ? location.wall : (WALLS.includes(old.wall) ? old.wall : 'back');
            const p = wallPlacement(info, wall, (wall === 'back'||wall==='front') ? location.x : location.z, house);
            item.x = p.x; item.z = p.z; item.rot = rotation(p.rot); item.wall = wall;
        } else {
            item.x = snap(location.x); item.z = snap(location.z); item.rot = rotation(location.rot);
        }
        if (isRoomPiece(item.type)) Object.assign(item, snapRoomPiece(house.furniture, { ...item, x: location.x, z: location.z }, house));
        if (wallFriendly(item.type)) Object.assign(item, snapToWall(house.furniture, { ...item, x: location.x, z: location.z }, house));
        const error = validate(house.furniture, item, house); if (error) return failure(error);
        return { ok: true, house: { ...copy(house), furniture: house.furniture.map(v => v.id === id ? item : copy(v)) } };
    }
    function store(house, id) {
        const moving = house.furniture.filter(v => v.id === id || v.support === id);
        if (!moving.length) return failure('Select an item.');
        if (house.inventory.length + moving.length > STORAGE_LIMIT) return failure('Not enough storage space.');
        const ids = new Set(moving.map(v => v.id));
        const stored = moving.map(v => { const item = { id: v.id, type: v.type,...itemMetadata(v) }; if (v.type === 'room_wall' && Number.isFinite(v.length)) item.length = wallLength(v); if (isScreenType(v.type) && v.stream) item.stream = copy(v.stream); return item; });
        return { ok: true, house: { ...copy(house), furniture: copy(house.furniture.filter(v => !ids.has(v.id))), inventory: [...copy(house.inventory), ...stored] } };
    }
    function buildRoom(house, money, start, end, side = 'front', roomId = 'room-preview') {
        if (![start?.x,start?.z,end?.x,end?.z].every(Number.isFinite)) return failure('Drag a rectangle on the grid.');
        if (!['front','back','left','right'].includes(side)) return failure('Choose a doorway side.');
        const x1=snap(Math.min(start.x,end.x)),x2=snap(Math.max(start.x,end.x)),z1=snap(Math.min(start.z,end.z)),z2=snap(Math.max(start.z,end.z));
        const width=x2-x1,depth=z2-z1,items=[],pool=copy(house.inventory);let price=0,index=0;
        const room=roomSize(house);
        if (width<4 || depth<4 || ((side==='left'||side==='right')&&depth<4.5)) return failure('Draw at least 4 × 4 units (4.5 deep for a side doorway).');
        if(x1 < -room.width/2 || x2 > room.width/2 || z1 < -room.depth/2 || z2 > room.depth/2) return failure('Keep the whole room inside the outlined floor.');
        const add=(type,x,z,rot,length)=>{
            const stock=pool.findIndex(v=>v.type===type),owned=stock<0?null:pool.splice(stock,1)[0];
            if(!owned)price+=byId[type].price;
            const item={id:owned?owned.id:roomId+'-'+(++index),type,x:precise(x),z:precise(z),rot,support:null,roomId};
            if(type==='room_wall')item.length=length;
            items.push(item);
        };
        const wall=(from,to,fixed,vertical)=>{
            // Split long runs into panels, leaving no sub-minimum remainder.
            let cursor=from;
            while(to-cursor>.001){let length=Math.min(6,to-cursor);if(to-cursor-length>0&&to-cursor-length<.5)length-=.5;
                add('room_wall',vertical?fixed:cursor+length/2,vertical?cursor+length/2:fixed,vertical?Math.PI/2:0,length);cursor+=length;}
        };
        const run=(from,to,fixed,vertical,door)=>{
            if(!door){wall(from,to,fixed,vertical);return;}
            const center=(from+to)/2;wall(from,center-1.5,fixed,vertical);
            add('room_doorway',vertical?fixed:center,vertical?center:fixed,vertical?Math.PI/2:0);
            wall(center+1.5,to,fixed,vertical);
        };
        run(x1,x2,z1+.125,false,side==='back');run(x1,x2,z2-.125,false,side==='front');
        run(z1+.25,z2-.25,x1+.125,true,side==='left');run(z1+.25,z2-.25,x2-.125,true,side==='right');
        const reject=error=>({ok:false,error,items,price,width,depth});
        if(capacityError(house,'room_wall',items.length))return reject('Not enough room-piece slots for this room.');
        const used=new Set(house.furniture.map(v=>v.id));
        const checked=[...house.furniture];
        for(const item of items){if(used.has(item.id))return reject('That room already exists.');used.add(item.id);const error=validate(checked,item,house);if(error)return reject(error);checked.push(item);}
        if(!Number.isFinite(money)||money<price)return reject('Not enough money to build this room.');
        return {ok:true,house:{...copy(house),furniture:checked,inventory:pool},money:money-price,items,price,width,depth};
    }
    function storeRoom(house, roomId) {
        const pieces=house.furniture.filter(v=>isRoomPiece(v.type)&&v.roomId===roomId);
        if(!roomId||!pieces.length)return failure('Select a wall from a drawn room first.');
        if(house.inventory.length+pieces.length>STORAGE_LIMIT)return failure('Not enough storage space for this room.');
        const ids=new Set(pieces.map(v=>v.id));
        return {ok:true,house:{...copy(house),furniture:copy(house.furniture.filter(v=>!ids.has(v.id))),inventory:[...copy(house.inventory),...pieces.map(v=>({id:v.id,type:v.type,...(v.type==='room_wall'?{length:wallLength(v)}:{})}))]}};
    }
    function collisionRects(item) {
        const info = byId[item.type];
        if (!info || item.support || info.wall || info.rug || info.h <= .3) return [];
        if (item.type !== 'room_doorway') return [footprint(item)];
        // A 1.8-unit passage between two .6-unit pillars. Lintel is overhead.
        const r = rotation(item.rot), c = Math.cos(r), s = Math.sin(r);
        return [-1.2,1.2].map(offset => footprint({ ...item, type: 'room_doorway', x: item.x+offset*c, z: item.z-offset*s })).map(rect => ({ ...rect, w: quarter(item.rot)%2 ? .25 : .6, d: quarter(item.rot)%2 ? .6 : .25 }));
    }
    function walkSurfaces(items, item) {
        const info=byId[item.type];if(!info||item.support||info.wall||info.rug||info.h<=.3)return [];
        const W=info.w,D=info.d,H=info.h,pose=resolve(items,item),parts=[];
        const add=(x,z,w,d,top,landable=true)=>parts.push({x,z,w,d,top,landable});
        if(standTops[info.id]===undefined&&info.style==='upholstered'){
            add(0,D*.07,W*.82,D*.72,H*.5);
            add(0,-D*.36,W*.9,D*.14,H*.83);
            for(const x of [-W*.46,W*.46])add(x,0,W*.08,D*.9,H*.69);
        }else if(standTops[info.id]===undefined&&info.style==='chair'){
            add(0,D*.06,W*.86,D*.72,H*.525);add(0,-D*.4,W*.86,.08,H*.91);
        }else if(standTops[info.id]===undefined&&['bed','canopy'].includes(info.style)){
            add(0,0,W*.9,D*.9,info.style==='canopy'?.76:H*.54);
            if(info.style==='canopy')for(const x of [-W*.46,W*.46])for(const z of [-D*.46,D*.46])add(x,z,.09,.09,Infinity,false);
            else add(0,-D*.47,W*.96,.1,H*.575);
        }else {
            const top=standHeight(info);
            return collisionRects(item).map(rect=>({...rect,top:top===undefined?Infinity:pose.y+top,landable:top!==undefined}));
        }
        const r=pose.rot,c=Math.cos(r),s=Math.sin(r),swap=quarter(r)%2;
        return parts.map(part=>({...part,x:pose.x+part.x*c+part.z*s,z:pose.z-part.x*s+part.z*c,w:swap?part.d:part.w,d:swap?part.w:part.d,top:pose.y+part.top}));
    }
    function collision(items, x, z, radius = .27) {
        const actor = { x, z, w: radius * 2, d: radius * 2 };
        return items.some(item => collisionRects(item).some(rect => overlap(actor, rect)));
    }

    // Trim earlier coplanar faces under later detail faces. This removes actual
    // overlapping geometry instead of relying on unstable depth-buffer ordering.
    function cleanCoplanarFaces(positions, colors) {
        const output=[],tints=[],planes=new Map(),epsilon=1e-8;
        const area=poly=>Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p.u*q.v-q.u*p.v;},0))/2;
        function split(poly,a,b,sign){
            const inside=[],outside=[];const distance=p=>sign*((b.u-a.u)*(p.v-a.v)-(b.v-a.v)*(p.u-a.u));
            for(let i=0;i<poly.length;i++){
                const p=poly[i],q=poly[(i+1)%poly.length],dp=distance(p),dq=distance(q);
                if(dp>=-epsilon)inside.push(p);if(dp<=epsilon)outside.push(p);
                if((dp>epsilon&&dq<-epsilon)||(dp<-epsilon&&dq>epsilon)){
                    const t=dp/(dp-dq),point={};for(const key of ['u','v','x','y','z','r','g','b'])point[key]=p[key]+(q[key]-p[key])*t;
                    inside.push(point);outside.push(point);
                }
            }
            return {inside,outside};
        }
        function subtract(poly,triangle){
            const sign=((triangle[1].u-triangle[0].u)*(triangle[2].v-triangle[0].v)-(triangle[1].v-triangle[0].v)*(triangle[2].u-triangle[0].u))>=0?1:-1;
            let intersection=poly;
            for(let i=0;i<3&&intersection.length;i++)intersection=split(intersection,triangle[i],triangle[(i+1)%3],sign).inside;
            if(intersection.length<3||area(intersection)<epsilon)return [poly];
            let remaining=poly;const pieces=[];
            for(let i=0;i<3&&remaining.length;i++){const part=split(remaining,triangle[i],triangle[(i+1)%3],sign);if(part.outside.length>=3&&area(part.outside)>epsilon)pieces.push(part.outside);remaining=part.inside;}
            return pieces;
        }
        for(let offset=positions.length-9;offset>=0;offset-=9){
            const a=new THREE.Vector3().fromArray(positions,offset),b=new THREE.Vector3().fromArray(positions,offset+3),c=new THREE.Vector3().fromArray(positions,offset+6);
            const normal=new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a));if(normal.lengthSq()<1e-16)continue;normal.normalize();
            const key=[normal.x,normal.y,normal.z,normal.dot(a)].map(v=>Math.round(v*100000)).join(',');
            const axis=Math.abs(normal.x)>Math.abs(normal.y)?(Math.abs(normal.x)>Math.abs(normal.z)?0:2):(Math.abs(normal.y)>Math.abs(normal.z)?1:2);
            const triangle=[a,b,c].map((p,i)=>({x:p.x,y:p.y,z:p.z,u:axis===0?p.y:p.x,v:axis===2?p.y:p.z,r:colors[offset+i*3],g:colors[offset+i*3+1],b:colors[offset+i*3+2]}));
            let pieces=[triangle];const cover=planes.get(key)||[];
            for(const face of cover){pieces=pieces.flatMap(poly=>subtract(poly,face));if(!pieces.length)break;}
            for(const poly of pieces)for(let i=1;i<poly.length-1;i++)for(const p of [poly[0],poly[i],poly[i+1]]){output.push(p.x,p.y,p.z);tints.push(p.r,p.g,p.b);}
            cover.push(triangle);planes.set(key,cover);
        }
        return {positions:output,colors:tints};
    }
    // One unlit, vertex-colored draw per item. No per-object lights or textures.
    function makeMesh(type, house, item) {
        const baseInfo=type==='room_wall'?{...byId[type],w:wallLength(item)}:byId[type];
        const info={...baseInfo,...(!isRoomPiece(type)&&/^#[0-9a-f]{6}$/i.test(item?.color)?{color:item.color}:{})}, positions=[],colors=[];
        const p = new THREE.Vector3(), n = new THREE.Vector3(), matrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3();
        function add(geometry, hex, x = 0, y = 0, z = 0, ry = 0) {
            matrix.makeRotationY(ry); matrix.setPosition(x, y, z); normalMatrix.getNormalMatrix(matrix);
            const color = new THREE.Color(hex), attribute = geometry.attributes.position, normals = geometry.attributes.normal;
            const count = geometry.index ? geometry.index.count : attribute.count;
            for (let k = 0; k < count; k++) {
                const i = geometry.index ? geometry.index.getX(k) : k;
                p.fromBufferAttribute(attribute, i).applyMatrix4(matrix); n.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix);
                const shade = isRoomPiece(type) ? 1 : .78 + .22 * Math.max(0, n.x * .3 + n.y * .8 + n.z * .5);
                positions.push(p.x, p.y, p.z); colors.push(color.r * shade, color.g * shade, color.b * shade);
            }
            geometry.dispose();
        }
        const box = (w, h, d, c, x, y, z, r) => add(new THREE.BoxGeometry(w, h, d), c, x, y, z, r);
        const cyl = (rt, rb, h, c, x, y, z) => add(new THREE.CylinderGeometry(rt, rb, h, 6), c, x, y, z);
        const wood = isRoomPiece(type) && /^#[0-9a-f]{6}$/i.test(house?.wall) ? house.wall : info.color, dark = isRoomPiece(type) && /^#[0-9a-f]{6}$/i.test(house?.trim) ? house.trim : '#684c38';
        if (type === 'room_wall') {
            box(info.w, info.h, .25, wood, 0, info.h / 2, 0);
            box(Math.max(.44,info.w-.06), .15, .29, dark, 0, .083, 0);
        } else if (type === 'room_doorway') {
            for (const x of [-1.2,1.2]) box(.6, info.h, .25, wood, x, info.h / 2, 0);
            box(1.8, info.h - 2.9, .25, wood, 0, (info.h + 2.9) / 2, 0);
            for (const x of [-.94,.94]) box(.08, 2.85, .3, dark, x, 1.425, 0);
            box(1.96, .1, .3, dark, 0, 2.9, 0);
        } else if (['table', 'coffee_table', 'desk', 'nightstand'].includes(type)) {
            box(info.w, .14, info.d, wood, 0, info.h - .07, 0);
            for (const x of [-1, 1]) for (const z of [-1, 1]) box(.12, info.h - .14, .12, dark, x * (info.w / 2 - .13), (info.h - .14) / 2, z * (info.d / 2 - .13));
            if (type === 'nightstand') { box(.82, .42, .75, wood, 0, .52, 0); box(.2, .05, .05, '#ddc187', 0, .53, .4); }
            if (type === 'desk') box(.55, .34, .8, dark, .57, .96, 0);
        } else if (type === 'chair') {
            box(.9, .14, .9, wood, 0, .67, 0); box(.9, 1.05, .12, wood, 0, 1.26, -.38);
            for (const x of [-.33, .33]) for (const z of [-.33, .33]) box(.11, .6, .11, dark, x, .3, z);
        } else if (type === 'sofa') {
            box(2.4, .45, 1.3, '#49695f', 0, .35, 0); box(2.1, .25, 1.1, wood, 0, .7, .08);
            box(2.4, .82, .22, wood, 0, .99, -.57);
            for (const x of [-1.12, 1.12]) box(.24, .62, 1.3, wood, x, .75, 0);
            for (const x of [-.54, .54]) box(.9, .08, .96, '#a7c0aa', x, .86, .1);
        } else if (type === 'bed') {
            box(1.95, .38, 2.95, dark, 0, .23, 0); box(1.88, .24, 2.85, '#eee4d1', 0, .54, 0);
            box(1.85, .08, 1.9, wood, 0, .7, .4); box(1.5, .18, .55, '#f4ebd8', 0, .76, -1.04);
            box(2, 1.1, .13, '#967258', 0, .75, -1.43);
        } else if (type === 'bookcase') {
            box(1.45, 2.3, .1, dark, 0, 1.15, -.44);
            for (const x of [-.69, .69]) box(.12, 2.3, .95, wood, x, 1.15, 0);
            for (const y of [.08, .8, 1.55, 2.24]) box(1.5, .12, 1, wood, 0, y, 0);
            for (let i = 0; i < 8; i++) box(.12, .4 + (i % 3) * .06, .48, ['#a56e69', '#739c95', '#bda16b'][i % 3], -.5 + (i % 4) * .25, i < 4 ? .34 : 1.09, 0);
        } else if (type === 'rug') {
            box(3, .025, 2, wood, 0, .0125, 0); box(2.7, .008, 1.7, '#dbbea0', 0, .029, 0); box(2.4, .006, 1.4, '#916e68', 0, .037, 0);
        } else if (type === 'lamp') {
            cyl(.21, .23, .07, '#71604c', 0, .035, 0); cyl(.035, .035, .48, '#b09b72', 0, .31, 0); cyl(.13, .24, .33, wood, 0, .72, 0);
        } else if (type === 'plant') {
            cyl(.2, .14, .3, '#b67e62', 0, .15, 0); cyl(.18, .18, .025, '#5b4733', 0, .3, 0);
            for (let i = 0; i < 4; i++) box(.1, .45 + (i % 2) * .15, .28, wood, Math.sin(i * Math.PI / 2) * .1, .57, Math.cos(i * Math.PI / 2) * .1, i * Math.PI / 2);
        } else if (type === 'books') {
            for (let i = 0; i < 3; i++) { box(.42, .07, .36, ['#9a696d', '#6a9396', '#b7a074'][i], 0, .04 + i * .075, 0, i * .08); box(.35, .035, .33, '#e8dfc8', 0, .04 + i * .075, .02, i * .08); }
        } else if (type === 'vase') {
            cyl(.12, .2, .3, wood, 0, .17, 0); cyl(.09, .12, .2, wood, 0, .41, 0); cyl(.1, .1, .05, '#547c81', 0, .525, 0);
        } else if (type === 'aquarium') {
            box(1.5,.1,1,'#52656c',0,.05,0);box(1.5,.1,1,'#52656c',0,.75,0);
            // Transparent aquarium glass is added after the opaque furniture batch.
            box(1.3, .06, .8, '#d3c59c', 0, .12, 0);
        } else if (info.style) {
            const W = info.w, D = info.d, H = info.h, C = info.color;
            const blend = (hex, other, t) => { const c = new THREE.Color(hex); c.lerp(new THREE.Color(other), t); return '#' + c.getHexString(); };
            const mul = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
            const dark = mul(C, .68), darker = mul(C, .48), mid = mul(C, .85), light = blend(C, '#ffffff', .2), glow = blend(C, '#ffffff', .45);
            const metal = '#8d98a1', glass = '#b8d4dd', paper = '#efe7d2', terracotta = '#b57154', flame = '#ff9a3c', flame2 = '#ffd36b';
            const cone = (r, h, c, x, y, z) => add(new THREE.ConeGeometry(r, h, 4), c, x, y, z);
            const ball = (r, c, x, y, z) => add(new THREE.SphereGeometry(r, 6, 3), c, x, y, z);
            const legs = (top, inset, size = .07) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(size, top, size, darker, sx * (W / 2 - inset), top / 2, sz * (D / 2 - inset)); };
            const front = D * .47;
            const styles = {
                canopy(){box(W,.35,D,dark,0,.25,0);box(W*.94,.25,D*.94,paper,0,.55,0);box(W*.92,.1,D*.65,C,0,.71,D*.14);for(const x of [-W*.46,W*.46])for(const z of [-D*.46,D*.46])box(.09,H,.09,darker,x,H/2,z);box(W,.1,D,dark,0,H-.05,0);box(W*.9,.12,D*.88,C,0,H-.18,0);},
                trunk(){box(W,H*.82,D,C,0,H*.41,0);box(W,H*.18,D,light,0,H*.91,0);for(const x of [-W*.3,W*.3])box(.06,H,D*1.01,darker,x,H/2,0);box(W*.12,H*.16,.03,metal,0,H*.65,D/2);},
                microwave(){box(W,H,D,C,0,H/2,0);box(W*.7,H*.7,.025,'#26313b',-W*.08,H*.5,D*.51);box(W*.08,H*.4,.04,metal,W*.34,H*.5,D*.53);box(W*.08,H*.1,.03,'#83b6a3',W*.43,H*.75,D*.52);},
                coffee_machine(){box(W,H*.8,D,C,0,H*.55,0);box(W*.95,H*.1,D,metal,0,H*.05,0);box(W*.6,H*.1,D*.4,metal,0,H*.55,D*.3);cyl(W*.2,W*.18,H*.22,paper,0,H*.22,D*.2);},
                toaster(){box(W,H*.9,D,C,0,H*.45,0);for(const x of [-W*.23,W*.23])box(W*.3,H*.04,D*.55,darker,x,H*.91,0);box(.04,H*.3,.04,metal,W*.52,H*.45,0);},
                kettle(){cyl(W*.3,W*.44,H*.65,C,0,H*.34,0);cyl(W*.25,W*.3,H*.07,metal,0,H*.7,0);box(W*.7,H*.07,D*.15,darker,0,H*.92,0);for(const x of [-W*.31,W*.31])box(W*.07,H*.23,D*.15,darker,x,H*.82,0);box(W*.25,H*.12,D*.2,C,W*.42,H*.5,0);},
                dishwasher(){box(W,H,D,C,0,H/2,0);box(W*.9,H*.75,.03,light,0,H*.43,D*.51);box(W*.65,H*.04,.06,dark,0,H*.83,D*.53);box(W*.14,H*.04,.03,'#8db7a0',W*.3,H*.94,D*.52);},
                fruit_bowl(){cyl(W*.46,W*.28,H*.4,C,0,H*.2,0);for(const [x,z,c] of [[-.2,0,'#ce6b53'],[.15,.15,'#8fa866'],[.18,-.15,'#e0ba5f']])ball(H*.25,c,x*W,H*.65,z*D);},
                plates(){for(let i=0;i<4;i++)cyl(W*.45,W*.42,H*.15,C,0,H*(.1+i*.2),0);},
                double_sink(){box(W,H*.85,D,C,0,H*.425,0);box(W,H*.1,D,paper,0,H*.9,0);for(const x of [-W*.25,W*.25]){cyl(W*.16,W*.16,.04,glass,x,H*.96,0);box(.05,H*.2,.05,metal,x,H*.9,-D*.3);}},
                bottles(){box(W,H*.15,D,dark,0,H*.075,0);for(const x of [-W*.25,0,W*.25]){cyl(W*.1,W*.13,H*.6,x===0?paper:C,x,H*.45,0);box(W*.16,H*.13,D*.2,metal,x,H*.82,0);}},
                computer(){box(W,H*.6,D*.13,darker,0,H*.7,-D*.1);box(W*.9,H*.5,.02,'#719aab',0,H*.7,0);box(W*.1,H*.25,D*.15,metal,0,H*.28,-D*.12);box(W*.7,H*.04,D*.65,dark,0,H*.04,D*.15);},
                organizer(){box(W,H*.1,D,C,0,H*.05,0);for(const x of [-W*.32,0,W*.32]){box(W*.24,H*.65,D*.8,dark,x,H*.35,0);for(const z of [-D*.12,D*.12])box(.025,H*.5,.025,paper,x,H*.7,z);}},
                piano(){box(W,H*.8,D,C,0,H*.6,-D*.1);box(W,H*.13,D*.7,dark,0,H*.43,D*.18);for(let i=0;i<10;i++){box(W*.085,H*.04,D*.4,paper,-W*.455+i*W*.1,H*.51,D*.33);if(i%3)box(W*.025,H*.04,D*.2,darker,-W*.43+i*W*.1,H*.54,D*.24);}legs(H*.4,.12,.1);},
                keyboard(){box(W,H*.12,D,C,0,H*.9,0);for(let i=0;i<18;i++)box(W*.047,H*.025,D*.6,i%3===0?darker:paper,-W*.47+i*W*.055,H*.97,D*.12);for(const x of [-W*.32,W*.32])box(.06,H*.84,.06,metal,x,H*.42,0);},
                guitar(){ball(W*.36,C,0,H*.3,0);ball(W*.27,C,0,H*.46,0);box(W*.12,H*.5,D*.15,darker,0,H*.7,0);box(W*.23,H*.14,D*.2,C,0,H*.93,0);cyl(W*.11,W*.11,.015,darker,0,H*.4,D*.3);box(W*.8,.06,D*.8,metal,0,.03,0);},
                chess(){styles.table();for(let x=0;x<8;x++)for(let z=0;z<8;z++)add(new THREE.PlaneGeometry(W*.11,D*.11).rotateX(-Math.PI/2),(x+z)%2?darker:paper,(x-3.5)*W*.11,H+.007,(z-3.5)*D*.11);},
                game_boxes(){for(let i=0;i<3;i++){box(W,H*.27,D,i===0?C:i===1?'#7497a2':'#baa16e',0,H*(.14+i*.3),0);box(W*.6,H*.04,.01,paper,0,H*(.14+i*.3),D*.505);}},
                record_player(){box(W,H*.65,D,C,0,H*.325,0);cyl(Math.min(W,D)*.38,Math.min(W,D)*.38,H*.05,darker,-W*.1,H*.7,0);cyl(.035,.035,.02,paper,-W*.1,H*.74,0);box(W*.35,.025,.025,metal,W*.24,H*.78,0);},
                sewing(){box(W,H*.15,D,C,0,H*.075,0);box(W*.18,H*.65,D*.7,C,W*.28,H*.47,0);box(W*.7,H*.2,D*.55,C,0,H*.85,0);box(.025,H*.35,.025,metal,-W*.28,H*.5,0);},
                easel(){for(const x of [-W*.4,W*.4])box(.07,H,.07,dark,x,H/2,0);box(W*.9,H*.6,D*.15,paper,0,H*.6,0);box(W*.5,H*.2,.025,C,0,H*.5,D*.1);box(W,H*.04,D*.4,dark,0,H*.25,D*.1);},
                washer(){box(W,H,D,C,0,H/2,0);box(W*.9,H*.16,.03,light,0,H*.87,D*.51);ball(Math.min(W,H)*.32,metal,0,H*.43,D*.23);ball(Math.min(W,H)*.25,'#526e7c',0,H*.43,D*.32);box(W*.15,H*.05,.04,dark,W*.3,H*.87,D*.53);},
                ironing(){box(W,H*.08,D,C,0,H*.94,0);for(const x of [-W*.3,W*.3])box(.06,H*.9,.06,metal,x,H*.45,0);box(W*.8,.04,.06,metal,0,H*.1,0);},
                rod_rack(){box(W,.12,D,C,0,.06,0);for(let i=0;i<4;i++){const x=(i-1.5)*W*.22;box(.025,H*.88,.025,darker,x,H*.52,0);box(.065,H*.2,.065,C,x,H*.2,0);}box(W,.08,D*.4,C,0,H*.45,0);},
                sailboat(){box(W*.85,H*.15,D*.6,C,0,H*.15,0);box(.025,H*.8,.025,dark,0,H*.55,0);cone(W*.34,H*.65,paper,W*.1,H*.6,0);},
                shells(){box(W,H*.15,D,C,0,H*.075,0);for(const x of [-W*.25,0,W*.25])ball(H*.3,paper,x,H*.5,0);},
                lighthouse(){cyl(W*.3,W*.43,H*.72,paper,0,H*.36,0);cyl(W*.32,W*.32,H*.12,C,0,H*.4,0);cyl(W*.35,W*.35,H*.13,glass,0,H*.8,0);cone(W*.45,H*.14,darker,0,H*.94,0);},
                fish_sculpture(){box(W*.8,H*.12,D*.8,dark,0,H*.06,0);box(.04,H*.35,.04,metal,0,H*.25,0);ball(H*.35,C,0,H*.6,0);cone(H*.3,H*.3,C,W*.33,H*.6,0);ball(.025,darker,-W*.13,H*.66,D*.25);},
                lantern(){box(W,H*.12,D,dark,0,H*.06,0);box(W*.65,H*.6,D*.65,'#e2c98c',0,H*.43,0);for(const x of [-W*.4,W*.4])for(const z of [-D*.4,D*.4])box(.03,H*.7,.03,C,x,H*.45,z);cone(W*.48,H*.24,C,0,H*.88,0);},
                catch_plaque(){box(W,H,D,C,0,0,0);box(W*.9,H*.8,.025,dark,0,0,D*.55);},
                plain() { box(W, H, D, C, 0, H / 2, 0); },
                upholstered() {
                    const seat = H * .4;
                    box(W * .9, H * .2, D * .86, C, 0, seat, 0);
                    box(W * .9, H * .46, D * .14, dark, 0, seat + H * .2, -D * .36);
                    box(W * .9, .06, D * .14, light, 0, seat + H * .43, -D * .36);
                    for (const s of [-1, 1]) box(W * .08, H * .34, D * .9, mid, s * (W / 2 - W * .05), seat + H * .12, 0);
                    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(W * .07, H * .18, D * .07, darker, sx * (W / 2 - W * .07), H * .09, sz * (D / 2 - D * .1));
                    if (info.id === 'recliner') box(W * .62, H * .14, D * .3, C, 0, H * .24, D * .34);
                },
                ottoman() {
                    box(W * .94, H * .5, D * .9, C, 0, H * .55, 0);
                    box(W * .78, .05, D * .74, light, 0, H * .82, 0);
                    legs(H * .3, W * .08);
                },
                beanbag() {
                    cyl(W * .44, W * .5, H * .62, C, 0, H * .31, 0);
                    cyl(W * .46, W * .46, .03, dark, 0, H * .58, 0);
                    cyl(W * .28, W * .4, H * .24, light, 0, H * .7, 0);
                },
                cabinet() {
                    const tall = H >= 1.9;
                    box(W * .96, H * .98, D * .92, C, 0, H * .49, 0);
                    box(W, .06, D, dark, 0, H - .03, 0);
                    if (tall) box(W * .9, .08, D * .86, darker, 0, .04, 0);
                    else legs(H * .1, W * .1);
                    if (info.id === 'fridge') {
                        box(W * .86, H * .82, .02, glow, 0, H * .48, front);
                        box(.03, H * .7, .02, metal, -W * .08, H * .5, front + .02);
                        box(W * .3, .04, .04, metal, W * .2, H * .55, front + .03);
                        box(W * .3, .04, .04, metal, W * .2, H * .38, front + .03);
                    } else if (info.id === 'tv_stand') {
                        box(W * .86, H * .6, .02, darker, 0, H * .45, front);
                        box(W * .78, .03, .02, mid, 0, H * .32, front + .02);
                        box(W * .78, .03, .02, mid, 0, H * .62, front + .02);
                    } else if (info.id === 'filing_cabinet' || info.id === 'dresser') {
                        for (let i = 0; i < 3; i++) {
                            const y = H * .62 - i * H * .28;
                            box(W * .8, H * .22, .02, mid, 0, y, front);
                            box(.18, .03, .03, metal, 0, y, front + .02);
                        }
                    } else {
                        box(W * .4, H * .62, .02, mid, -W * .22, H * .5, front);
                        box(W * .4, H * .62, .02, mid, W * .22, H * .5, front);
                        box(.04, .16, .03, metal, -W * .02, H * .5, front + .02);
                        box(.04, .16, .03, metal, W * .02, H * .5, front + .02);
                    }
                },
                table() {
                    box(W, H * .08, D, C, 0, H - H * .04, 0);
                    legs(H * .92, W * .09);
                    if (info.id === 'executive_desk') {
                        box(W * .3, H * .22, D * .62, darker, W * .22, H * .72, 0);
                        box(.18, .05, .03, metal, W * .22, H * .75, D * .32);
                    } else box(W * .8, .05, D * .7, mid, 0, H * .38, 0);
                },
                round_table() {
                    cyl(W * .5, W * .5, .08, C, 0, H - .04, 0);
                    cyl(.06, .08, H - .12, darker, 0, (H - .12) / 2, 0);
                    cyl(W * .3, W * .34, .06, darker, 0, .03, 0);
                    if (info.id === 'bar_table') cyl(W * .3, W * .3, .04, mid, 0, H * .4, 0);
                },
                stool() {
                    cyl(W * .48, W * .48, .1, C, 0, H - .05, 0);
                    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.07, H - .1, .07, darker, sx * W * .28, (H - .1) / 2, sz * D * .28);
                    box(W * .6, .05, .05, metal, 0, H * .35, 0);
                },
                chair() {
                    box(W * .86, H * .08, D * .86, C, 0, H * .46, 0);
                    box(W * .86, H * .42, .08, C, 0, H * .7, -D * .4);
                    box(W * .8, .05, D * .8, light, 0, H * .5, 0);
                    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.07, H * .46, .07, darker, sx * (W / 2 - W * .1), H * .23, sz * (D / 2 - D * .1));
                },
                bench() {
                    box(W * .96, H * .12, D * .9, C, 0, H * .5, 0);
                    box(W * .08, H * .5, D * .78, darker, -W * .4, H * .25, 0);
                    box(W * .08, H * .5, D * .78, darker, W * .4, H * .25, 0);
                    box(W * .8, .06, .08, darker, 0, H * .24, 0);
                },
                counter() {
                    box(W * .94, H * .94, D * .9, light, 0, H * .47, 0);
                    box(W, .08, D, glow, 0, H - .04, 0);
                    box(W * .88, .06, D * .84, darker, 0, .03, 0);
                    for (let i = -1; i <= 1; i++) {
                        box(W * .26, H * .28, .02, mid, i * W * .3, H * .72, D * .46);
                        box(.16, .03, .03, metal, i * W * .3, H * .72, D * .48);
                    }
                },
                office_chair() {
                    box(W * .82, H * .1, D * .82, C, 0, H * .44, 0);
                    box(W * .78, H * .48, .1, dark, 0, H * .7, -D * .38);
                    for (const s of [-1, 1]) {
                        box(.05, H * .28, .05, darker, s * W * .4, H * .36, 0);
                        box(.08, .05, D * .5, darker, s * W * .4, H * .52, 0);
                    }
                    cyl(.05, .07, H * .32, darker, 0, H * .2, 0);
                    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; box(W * .5, .06, .08, metal, Math.sin(a) * W * .18, .06, Math.cos(a) * D * .18, a); }
                },
                bed() {
                    box(W * .96, H * .3, D * .96, darker, 0, H * .15, 0);
                    box(W * .9, H * .22, D * .9, light, 0, H * .38, 0);
                    box(W * .86, H * .08, D * .55, C, 0, H * .5, D * .15);
                    box(W * .34, H * .12, D * .22, paper, -W * .2, H * .52, -D * .34);
                    if (W > 2) box(W * .34, H * .12, D * .22, paper, W * .2, H * .52, -D * .34);
                    box(W * .96, H * .35, .1, C, 0, H * .4, -D * .47);
                },
                bunk() {
                    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.1, H, .1, darker, sx * (W / 2 - .06), H / 2, sz * (D / 2 - .06));
                    box(W * .94, .12, D * .9, mid, 0, H * .28, 0);
                    box(W * .86, .18, D * .8, C, 0, H * .36, 0);
                    box(W * .94, .12, D * .9, mid, 0, H * .72, 0);
                    box(W * .86, .18, D * .8, C, 0, H * .8, 0);
                    box(W * .7, H * .12, .08, C, 0, H * .98, -D * .42);
                    box(.08, H * .12, D * .7, C, -W * .4, H * .98, -D * .2);
                    for (const s of [-1, 1]) box(.06, H * .6, .06, metal, -W * .35 + (s < 0 ? 0 : W * .15), H * .3, D * .42);
                    for (let i = 0; i < 4; i++) box(.2, .04, .04, metal, -W * .275, H * .12 + i * H * .13, D * .42);
                },
                vanity() {
                    box(W * .9, H * .94, D * .85, C, 0, H * .47, 0);
                    box(W, H * .07, D, light, 0, H - H * .035, 0);
                    box(W * .8, .06, D * .7, darker, 0, .03, 0);
                    box(W * .35, H * .2, .02, mid, -W * .2, H * .4, front);
                    box(.16, .03, .03, metal, -W * .2, H * .42, front + .02);
                    box(W * .7, H * .55, .04, darker, 0, H * .8, -D * .3);
                    box(W * .62, H * .47, .02, glass, 0, H * .8, -D * .27);
                    box(.04, H * .2, .04, dark, 0, H * .72, -D * .3);
                },
                basket() {
                    cyl(W * .42, W * .34, H * .9, C, 0, H * .45, 0);
                    cyl(W * .44, W * .44, .06, darker, 0, H * .86, 0);
                    for (let i = 0; i < 4; i++) box(.04, H * .5, .02, darker, -W * .2 + i * W * .13, H * .45, D * .3);
                },
                mirror() {
                    const frame = blend(C, '#5b4a3a', .5);
                    box(W * .12, H * .96, .08, frame, -W * .44, H * .48, 0);
                    box(W * .12, H * .96, .08, frame, W * .44, H * .48, 0);
                    box(W * .88, .08, .08, frame, 0, H * .94, 0);
                    box(W * .88, .08, .08, frame, 0, H * .02, 0);
                    box(W * .76, H * .84, .02, glass, 0, H * .48, .05);
                    for (const s of [-1, 1]) box(.06, H * .3, .06, frame, s * W * .35, H * .15, 0);
                },
                fireplace() {
                    box(W * .96, H * .5, D, C, 0, H * .28, 0);
                    box(W * .66, H * .9, D * .7, darker, 0, H * .45, 0);
                    box(W * 1.04, .08, D * 1.04, light, 0, H * .62, 0);
                    box(W * .5, H * .32, .05, '#2a211d', 0, H * .28, D * .37);
                    box(W * .46, .06, .08, dark, 0, H * .16, D * .4);
                    cone(W * .07, H * .18, flame, -W * .12, H * .28, D * .4);
                    cone(W * .05, H * .14, flame2, W * .02, H * .25, D * .42);
                },
                stove() {
                    box(W * .96, H * .96, D * .9, C, 0, H * .48, 0);
                    box(W, .06, D, glow, 0, H - .03, 0);
                    for (const x of [-W * .25, W * .25]) for (const z of [-D * .22, D * .22]) cyl(.09, .09, .02, dark, x, H + .01, z);
                    box(W * .7, H * .4, .03, darker, 0, H * .35, D * .46);
                    box(W * .4, .04, .04, metal, 0, H * .5, D * .49);
                    for (const x of [-W * .25, 0, W * .25]) cyl(.04, .04, .04, metal, x, H * .72, D * .47);
                },
                bathtub() {
                    box(W * .96, H * .6, D * .9, C, 0, H * .32, 0);
                    box(W, H * .08, D, light, 0, H * .62, 0);
                    box(W * .82, .03, D * .72, '#79b6c9', 0, H * .6, 0);
                    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.1, .12, .1, darker, sx * W * .4, .06, sz * D * .38);
                    box(.06, H * .3, .06, metal, W * .38, H * .7, D * .35);
                    box(.2, .05, .06, metal, W * .32, H * .84, D * .35);
                },
                shower() {
                    box(W * .96, .1, D * .9, light, 0, .05, 0);
                    box(W * .96, H * .95, .03, glass, 0, H * .5, -D * .45);
                    box(.03, H * .95, D * .9, glass, -W * .47, H * .5, 0);
                    box(.03, H * .95, D * .9, glass, W * .47, H * .5, 0);
                    box(W * .9, .08, D * .9, metal, 0, H * .96, 0);
                    cyl(.06, .06, .06, metal, 0, H * .9, D * .2);
                    cyl(.04, .04, H * .3, metal, 0, H * .8, 0);
                    box(.06, .06, .3, metal, 0, H * .9, D * .1);
                },
                toilet() {
                    cyl(.3, .34, .35, C, 0, H * .35, 0);
                    box(W * .75, H * .5, D * .3, C, 0, H * .72, -D * .32);
                    box(W * .8, .06, D * .72, light, 0, H * .56, 0);
                    box(W * .6, .04, D * .5, mid, 0, H * .6, .02);
                    box(.1, .05, .05, metal, 0, H * .88, -D * .45);
                },
                sink() {
                    const bw = Math.min(W, D);
                    box(W * .5, H * .85, D * .6, C, 0, H * .42, 0);
                    cyl(bw * .42, bw * .34, .12, glow, 0, H * .86, 0);
                    box(W * .8, .05, D * .8, light, 0, H * .93, 0);
                    box(.05, H * .25, .05, metal, 0, H * 1.02, -D * .28);
                    box(.16, .05, .06, metal, 0, H * 1.12, -D * .22);
                },
                lamp() {
                    const base = Math.max(.1, W * .35);
                    cyl(base, base, .05, darker, 0, .025, 0);
                    cyl(.03, .04, H * .55, metal, 0, H * .3, 0);
                    cyl(W * .18, W * .38, H * .3, C, 0, H * .72, 0);
                    box(.08, .08, .08, glow, 0, H * .58, 0);
                },
                arc_lamp() {
                    cyl(W * .35, W * .4, .06, darker, 0, .03, 0);
                    cyl(.035, .045, H * .72, metal, -W * .2, H * .36, 0);
                    box(W * .7, .06, .06, metal, W * .05, H * .72, 0);
                    cyl(W * .18, W * .28, .25, C, W * .4, H * .6, 0);
                },
                candles() {
                    box(W, H * .12, D, darker, 0, H * .06, 0);
                    for (const [x, z, r, h] of [[-W * .25, -D * .15, .06, H * .5], [W * .15, -D * .2, .05, H * .7], [W * .25, D * .2, .04, H * .35]]) {
                        cyl(r, r, h, paper, x, H * .12 + h / 2, z);
                        cone(r * .7, r * .9, flame2, x, H * .12 + h + .03, z);
                    }
                },
                clock() {
                    if (H > 1) {
                        box(W * .9, H * .94, D * .8, C, 0, H * .47, 0);
                        box(W * 1.02, H * .05, D * .9, darker, 0, H - .025, 0);
                        box(W * .6, H * .34, .02, paper, 0, H * .72, D * .41);
                        box(.04, H * .18, .02, dark, 0, H * .72, D * .43);
                        box(.14, .03, .02, dark, 0, H * .72 + .05, D * .43);
                        box(W * .5, H * .3, .02, '#3a2b20', 0, H * .35, D * .41);
                        cyl(.05, .05, H * .18, '#c9a55a', 0, H * .28, D * .42);
                    } else {
                        box(W * .9, H * .8, D * .7, C, 0, H * .45, 0);
                        box(W * .7, H * .55, .02, paper, 0, H * .5, D * .36);
                        box(.03, H * .1, .02, dark, 0, H * .5, D * .38);
                        box(.08, .02, .02, dark, 0, H * .53, D * .38);
                        for (const s of [-1, 1]) box(.04, H * .4, .04, darker, s * W * .3, H * .2, 0);
                    }
                },
                sculpture() {
                    box(W * .9, H * .12, D * .9, darker, 0, H * .06, 0);
                    box(W * .45, H * .45, D * .4, C, 0, H * .4, 0);
                    box(W * .6, .08, D * .2, mid, 0, H * .55, 0);
                    ball(W * .24, glow, 0, H * .75, 0);
                },
                pedestal() {
                    box(W, H * .12, D, darker, 0, H * .06, 0);
                    box(W * .7, H * .76, D * .7, C, 0, H * .5, 0);
                    box(W * .95, H * .06, D * .95, light, 0, H - .03, 0);
                },
                screen() {
                    for (const [x, a] of [[-W * .3, .35], [0, 0], [W * .3, -.35]]) {
                        box(W * .34, H * .9, .05, C, x, H * .45, 0, a);
                        box(.08, .08, D * .8, darker, x, H * .04, 0, a);
                    }
                },
                coat_rack() {
                    cyl(W * .35, W * .4, .06, darker, 0, .03, 0);
                    cyl(.04, .05, H * .9, metal, 0, H * .45, 0);
                    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; box(.05, .05, D * .5, dark, Math.sin(a) * D * .2, H * .85, Math.cos(a) * D * .2, a); }
                    ball(.06, glow, 0, H * .92, 0);
                },
                towel_rack() {
                    for (const s of [-1, 1]) box(.05, H * .9, .05, metal, s * W * .4, H * .45, 0);
                    box(W * .85, .05, .05, metal, 0, H * .82, 0);
                    box(W * .7, H * .35, .04, paper, 0, H * .6, 0);
                    for (const s of [-1, 1]) box(.08, .06, D * .8, darker, s * W * .4, .03, 0);
                },
                plant() {
                    cyl(W * .4, W * .32, H * .28, terracotta, 0, H * .14, 0);
                    cyl(W * .34, W * .34, H * .04, '#4b3a2a', 0, H * .29, 0);
                    if (info.id === 'cactus') {
                        cyl(W * .18, W * .22, H * .55, C, 0, H * .55, 0);
                        for (const s of [-1, 1]) { box(W * .34, .06, .06, C, s * W * .18, H * .55, 0); cyl(W * .1, W * .12, H * .25, C, s * W * .34, H * .62, 0); }
                        ball(.07, '#e9b7c5', 0, H * .86, 0);
                    } else if (info.id === 'fern') {
                        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; box(W * .08, H * .35, D * .3, C, Math.sin(a) * W * .2, H * .55, Math.cos(a) * D * .2, a); }
                    } else {
                        box(.05, H * .74, .05, darker, 0, H * .39, 0);
                        for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; box(W * .5, H * .12, D * .16, C, Math.sin(a) * W * .15, H * .58 + i * .07, Math.cos(a) * D * .15, a); }
                    }
                },
                bonsai() {
                    cyl(W * .4, W * .32, H * .3, terracotta, 0, H * .15, 0);
                    cyl(W * .34, W * .34, H * .04, '#4b3a2a', 0, H * .31, 0);
                    cyl(.05, .06, H * .3, dark, 0, H * .45, 0);
                    cone(W * .35, H * .2, C, -W * .1, H * .62, 0);
                    cone(W * .3, H * .18, C, W * .12, H * .55, 0);
                    box(W * .18, .04, .08, light, -W * .05, H * .5, 0);
                },
                bouquet() {
                    cyl(W * .3, W * .36, H * .4, '#8aa9b6', 0, H * .2, 0);
                    box(W * .5, .04, .08, C, 0, H * .5, 0);
                    for (let i = 0; i < 4; i++) {
                        const a = i * Math.PI / 2;
                        cyl(.015, .015, H * .3, C, Math.sin(a) * W * .08, H * .55, Math.cos(a) * W * .08);
                        ball(.07, '#e58ea5', Math.sin(a) * W * .14, H * .72, Math.cos(a) * W * .14);
                    }
                },
                rug() {
                    if (info.id === 'round_rug') {
                        cyl(W * .5, W * .5, .02, C, 0, .01, 0);
                        cyl(W * .42, W * .42, .015, light, 0, .025, 0);
                        cyl(W * .3, W * .3, .012, mid, 0, .04, 0);
                    } else if (info.id === 'fur_rug') {
                        box(W, H, D, C, 0, H / 2, 0);
                        box(W * .92, H * .6, D * .9, light, 0, H * .7, 0);
                        for (let i = -2; i <= 2; i++) { box(.08, .02, D * .12, mid, i * W * .16, H * .9, D * .46); box(.08, .02, D * .12, mid, i * W * .16, H * .9, -D * .46); }
                    } else {
                        box(W, H, D, C, 0, H / 2, 0);
                        box(W * .86, H * .5, D * .84, light, 0, H * .65, 0);
                        box(W * .7, H * .4, D * .68, mid, 0, H * .8, 0);
                    }
                },
                shelf() {
                    for (const s of [-1, 1]) box(W * .08, H, D, mid, s * W * .46, H / 2, 0);
                    box(W * .92, .08, D, mid, 0, H - .04, 0);
                    box(W * .92, .08, D, mid, 0, .04, 0);
                    for (const y of [H * .35, H * .68]) box(W * .84, .05, D * .9, mid, 0, y, 0);
                    for (let i = 0; i < 6; i++) box(W * .1, H * .15, D * .5, ['#a56e69', '#739c95', '#bda16b'][i % 3], -W * .3 + i * W * .12, H * .2 + (i % 2) * H * .33, 0);
                },
                board() {
                    box(W, H * .9, .06, C, 0, H * .45, 0);
                    box(W * 1.04, .06, .08, darker, 0, H * .9, 0);
                    box(W * 1.04, .06, .08, darker, 0, .05, 0);
                    for (const s of [-1, 1]) box(.06, H * .85, .08, darker, s * W * .5, H * .45, 0);
                    for (const [x, y] of [[-W * .2, H * .6], [W * .15, H * .55], [0, H * .35]]) box(W * .18, H * .14, .01, paper, x, y, .04);
                },
                typewriter() {
                    box(W * .9, H * .35, D * .8, C, 0, H * .2, 0);
                    box(W * .7, H * .35, D * .5, darker, 0, H * .45, -D * .1);
                    box(W * .8, .08, .08, metal, 0, H * .62, -D * .15);
                    box(W * .5, H * .35, .02, paper, 0, H * .75, -D * .15);
                    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) box(.08, .03, .06, paper, (i - 1) * W * .18, H * .36, D * .08 + j * .1);
                    for (const s of [-1, 1]) box(.05, .05, .05, metal, s * W * .38, H * .48, -D * .1);
                },
                globe() {
                    cyl(W * .3, W * .36, .05, darker, 0, .025, 0);
                    cyl(.04, .05, H * .5, metal, 0, H * .28, 0);
                    box(W * .5, .04, .04, metal, 0, H * .55, 0, .4);
                    ball(W * .34, C, 0, H * .62, 0);
                },
                stream_tv() {
                    const sw = W * .9, sh = sw * 9 / 16;
                    box(W, sh + .12, D * .55, dark, 0, H * .62, 0);
                    box(sw, sh, D * .08, '#07090b', 0, H * .62, D * .31);
                    box(W * .25, H * .22, D * .5, metal, 0, H * .29, 0);
                    box(W * .55, H * .05, D * .8, metal, 0, H * .03, 0);
                    box(.08, .04, .02, '#7cf3a0', -W * .38, H * .12, D * .31);
                },
                wall_tv() {
                    const screen = info.screen || {};
                    const sw = screen.w || W * .98, sh = screen.h || sw * 9 / 16;
                    box(W, H, D, dark, 0, 0, 0);
                    box(sw, sh, .025, '#07090b', 0, 0, D * .5);
                    box(W * .82, .12, D * 1.8, metal, 0, -H / 2 - .1, D * .2);
                    box(.08, .04, .02, '#7cf3a0', -W * .42, -H * .35, D * .55);
                }
            };
            (styles[info.style] || styles.plain)();
        }
        const geometry = new THREE.BufferGeometry();
        // Keep flush fixtures a hair inside the perimeter's visible plane.
        // Logical placement stays exact; only shared boundary faces are inset.
        if(house&&item&&!item.support&&Number.isFinite(item.x)&&Number.isFinite(item.z)){
            const size=roomSize(house),r=rotation(item.rot),c=Math.cos(r),s=Math.sin(r),gap=.008;
            for(let i=0;i<positions.length;i+=3){
                const x=item.x+positions[i]*c+positions[i+2]*s,z=item.z-positions[i]*s+positions[i+2]*c;
                const nx=Math.max(-size.width/2+gap,Math.min(size.width/2-gap,x)),nz=Math.max(-size.depth/2+gap,Math.min(size.depth/2-gap,z));
                if(nx!==x||nz!==z){positions[i]=(nx-item.x)*c-(nz-item.z)*s;positions[i+2]=(nx-item.x)*s+(nz-item.z)*c;}
            }
        }
        const clean=cleanCoplanarFaces(positions,colors);
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(clean.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(clean.colors, 3));
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true })); mesh.name = 'houseFurniture';
        if(type==='aquarium'){
            const glass=new THREE.Mesh(new THREE.BoxGeometry(1.4,.58,.9),new THREE.MeshBasicMaterial({color:'#9bdbe8',transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}));
            glass.name='aquariumGlass';glass.position.y=.39;glass.renderOrder=2;mesh.add(glass);
        }
        if(item?.displayCatch&&['aquarium','catch_plaque'].includes(type)){
            const fish=itemMetadata(item).displayCatch;
            if(typeof window!=='undefined'&&window.Character3D?.buildFish){
                const specimen=window.Character3D.buildFish(fish.name,fish.color);
                const bounds=new THREE.Box3().setFromObject(specimen),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
                const limits=type==='aquarium'?[1.12,.38,.60]:[1.2,.56,.4];
                const scale=Math.min(limits[0]/Math.max(size.x,.001),limits[1]/Math.max(size.y,.001),limits[2]/Math.max(size.z,.001));
                // Keep model-specific proportions, including upright seahorses and flat rays.
                const holder=new THREE.Group();holder.name='displayCatchModel';holder.userData={fishName:fish.name,is3D:true};
                specimen.scale.multiplyScalar(scale);specimen.position.sub(center.multiplyScalar(scale));holder.add(specimen);
                holder.position.set(0,type==='aquarium'?.40:0,type==='aquarium'?0:.36);mesh.add(holder);
            }else if(typeof createFishTexture==='function'){
                const texture=createFishTexture(fish.name,fish.color);
                const image=new THREE.Mesh(new THREE.PlaneGeometry(type==='aquarium'?.56:.78,type==='aquarium'?.56:.78),new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.25,depthWrite:false,side:THREE.DoubleSide}));
                image.name='displayCatchSprite';image.userData.fishName=fish.name;image.position.set(0,type==='aquarium'?.39:0,type==='aquarium'?.48:.16);mesh.add(image);
            }
            if(typeof document!=='undefined'){
                const canvas=document.createElement('canvas');canvas.width=640;canvas.height=180;const ctx=canvas.getContext('2d');
                ctx.fillStyle='#14252e';ctx.fillRect(0,0,640,180);ctx.fillStyle='#ffe6a3';ctx.font='bold 28px sans-serif';ctx.textAlign='center';ctx.fillText(fish.name,320,36,620);
                ctx.fillStyle='#f2f3ed';ctx.font='23px sans-serif';ctx.fillText('Size: '+fish.size+' ('+(fish.sizeLabel||'Normal')+') · '+(fish.rarity||'Unknown rarity'),320,78,620);
                ctx.fillText('Tier: '+(fish.tierName||'Normal')+' · Zone: '+(fish.zone||'Unknown'),320,116,620);
                ctx.fillText('Catch value: $'+(fish.price||0).toLocaleString(),320,154,620);
                const texture=new THREE.CanvasTexture(canvas);texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
                const stats=new THREE.Mesh(new THREE.PlaneGeometry(type==='aquarium'?1.8:2,.5),new THREE.MeshBasicMaterial({map:texture,depthWrite:false}));stats.name='displayCatchStats';stats.position.set(0,type==='aquarium'?1.1:-.8,type==='aquarium'?.5:.17);mesh.add(stats);
            }
        }
        return mesh;
    }
    // One reusable offscreen renderer; thumbnails never create media players.
    let previewRenderer=null, previewFailed=false;
    const previewCache=new Map();
    function thumbnail(type, house, item) {
        if(!byId[type]||previewFailed||typeof document==='undefined'||typeof document.createElementNS!=='function')return null;
        const key=JSON.stringify([type,item?.color,item?.displayCatch,type==='room_wall'?wallLength(item):null,isRoomPiece(type)?house?.wall:null,isRoomPiece(type)?house?.trim:null]);
        if(previewCache.has(key))return previewCache.get(key);
        let mesh=null;
        try {
            if(!previewRenderer){
                previewRenderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
                previewRenderer.setPixelRatio(1);previewRenderer.setSize(128,96,false);previewRenderer.setClearColor('#172329',0);
            }
            mesh=makeMesh(type,house,item);
            const center=mesh.geometry.boundingSphere.center, radius=Math.max(.1,mesh.geometry.boundingSphere.radius);
            mesh.position.copy(center).multiplyScalar(-1);
            const scene=new THREE.Scene();scene.add(mesh);
            const camera=new THREE.PerspectiveCamera(35,128/96,.01,1000);
            const distance=radius/Math.sin(35*Math.PI/360)*1.12;
            camera.position.set(1,.75,1.25).normalize().multiplyScalar(distance);camera.lookAt(0,0,0);
            previewRenderer.render(scene,camera);
            const result=previewRenderer.domElement.toDataURL('image/png');
            if(previewCache.size>=256)previewCache.delete(previewCache.keys().next().value);
            previewCache.set(key,result);return result;
        } catch(error) {
            previewFailed=true;
            if(previewRenderer){previewRenderer.dispose();previewRenderer=null;}
            return null;
        } finally {if(mesh){
            const geometries=new Set(),materials=new Set(),textures=new Set();
            mesh.traverse(obj=>{if(obj.geometry)geometries.add(obj.geometry);if(obj.material)for(const material of Array.isArray(obj.material)?obj.material:[obj.material]){materials.add(material);if(material.map)textures.add(material.map);}});
            geometries.forEach(v=>v.dispose());materials.forEach(v=>v.dispose());textures.forEach(v=>v.dispose());
        }}
    }
    window.Furniture = { transferCatch, WALLS, collections, collectionProgress, claimCollection, itemMetadata, thumbnail, INTERIOR_HEIGHT, limits, usage, capacityError, catalogSections, wallFriendly, snapToWall, buildRoom, storeRoom, floorPlan, planPoint, wallLength, isRoomPiece, snapRoomPiece, ROOM_SIZES, sizeTier, roomSize, upgradeHouse, collisionRects, walkSurfaces, cleanCoplanarFaces, LIMIT, STORAGE_LIMIT, STEP, catalog, byId, snap, quarter, rotation, footprint, resolve, validate, normalizeLayout, normalizeInventory, normalizeStream, buy, place, move, store, collision, makeMesh, overlap, standHeight, isScreenType, wallRotation, wallPlacement };
})();
