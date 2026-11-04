// Demo data for the NIRAH prototype: settings, categories, a curated catalogue,
// promotions, site content, staff accounts and ~60 days of order history.
// Every generated number is deterministic so reports look the same on each reset.
(() => {
  const N = (window.Nirah = window.Nirah || {});
  const DAY = 86400000;
  const U = (id) => `https://images.unsplash.com/photo-${id}`;

  const settings = {
    reservationMinutes: 10,
    lowStockDefault: 5,
    priceFloorPercent: 50,
    roundPricesTo: 1,
    returnWindowDays: 7,
    newArrivalDays: 45,
    couponStacking: false,
    shippingTaxRate: 18,
    orderMinimum: 0,
    checkoutBanner: "Prices include GST. Your items are held for 10 minutes while you pay.",
    taxClasses: {
      standard: { label: "GST 18%", rate: 18 },
      reduced: { label: "GST 12%", rate: 12 },
      essential: { label: "GST 5%", rate: 5 },
      exempt: { label: "GST exempt", rate: 0 },
    },
    shipping: {
      zones: [
        { id: "metro", name: "Metro cities", prefixes: ["110", "400", "560", "600", "700", "500", "411", "380"], fee: 49, freeAbove: 999, eta: "2–4 business days" },
        { id: "india", name: "Rest of India", prefixes: ["1", "2", "3", "4", "5", "6", "7", "8"], fee: 79, freeAbove: 1499, eta: "4–7 business days" },
      ],
      blockedPrefixes: ["744"],
    },
    bestSellers: { auto: true, windowDays: 30, topN: 8, deductReturns: true },
    paymentMethods: { upi: true, card: true, netbanking: true, wallet: false },
    searchSynonyms: { mug: ["cup", "tumbler"], cup: ["mug", "tumbler"], lamp: ["light"], throw: ["blanket"], dog: ["pet"], cat: ["pet"], tee: ["t-shirt", "shirt"] },
    promotedSearch: { gift: ["p-giftbox"], coffee: ["p-coffee"] },
    gateway: { provider: "NIRAH Pay (sandbox)", keyId: "sbx_key_7Q2nV9", webhookSecret: "whsec_sbx_4f9a1c7e2b" },
    business: {
      name: "NIRAH Retail (demo entity)",
      email: "care@nirah.example",
      phone: "+91 80 0000 0000",
      address: "No. 12, Example Road, Indiranagar, Bengaluru 560038",
      gstin: "To be confirmed",
      hours: "Mon–Sat, 10am–6pm IST",
    },
  };

  const categories = [
    { id: "cat-kitchen", parentId: null, name: "Kitchen Essentials", slug: "kitchen-essentials", order: 1, image: U("1556911220-bff31c812dba"), description: "Cookware, tableware and drinkware chosen to last through everyday use." },
    { id: "cat-cookware", parentId: "cat-kitchen", name: "Cookware", slug: "cookware", order: 1, image: U("1590794056226-79ef3a8147e1"), description: "Heavy-bottomed pots and pans that cook evenly." },
    { id: "cat-tableware", parentId: "cat-kitchen", name: "Tableware", slug: "tableware", order: 2, image: U("1578749556568-bc2c40e68b61"), description: "Plates, bowls and cups for the everyday table." },
    { id: "cat-home", parentId: null, name: "Home & Living", slug: "home-living", order: 2, image: U("1524758631624-e2822e304c36"), description: "Quiet, useful pieces that make a home feel finished." },
    { id: "cat-pets", parentId: null, name: "Pet Supplies", slug: "pet-supplies", order: 3, image: U("1543466835-00a7907e9de1"), description: "Comfortable, washable essentials for dogs and cats." },
    { id: "cat-textiles", parentId: null, name: "Textiles & Fashion", slug: "textiles-fashion", order: 4, image: U("1490481651871-ab68de25d43d"), description: "Natural fibres, honest construction and easy care." },
    { id: "cat-essentials", parentId: null, name: "Everyday Essentials", slug: "everyday-essentials", order: 5, image: U("1612817288484-6f916006741a"), description: "Daily-use care and carry items, chosen for gentle ingredients and durability." },
    { id: "cat-pantry", parentId: null, name: "Food & Pantry", slug: "food-pantry", order: 6, image: U("1497935586351-b67a49e012bf"), description: "Small-batch pantry staples with clear sourcing and best-before dates." },
    { id: "cat-gifts", parentId: null, name: "Art & Gifts", slug: "art-gifts", order: 7, image: U("1513519245088-0e12902e5a38"), description: "Prints, gift boxes and materials for people who make things." },
  ].map((c) => ({ active: true, archived: false, ...c }));

  // [id, sku, title, categoryId, brand, short, price, stock, imageId, alt, extra]
  const P = (id, sku, title, categoryId, brand, short, price, stock, img, alt, x = {}) => ({
    id,
    sku,
    title,
    categoryId,
    brand,
    short,
    price,
    stock,
    images: [
      { src: U(img), alt },
      { src: U(img), alt: `${alt}, close-up`, zoom: x.zoom || [0.5, 0.55, 1.8] },
    ],
    ...x,
  });

  const products = [
    P("p-casserole", "NRH-KIT-001", "Enamelled Cast Iron Casserole, 3.5 L", "cat-cookware", "Hearthline", "Cast iron · 3.5 L", 4490, 14, "1590794056226-79ef3a8147e1", "Orange enamelled cast iron casserole on a kitchen counter", {
      material: "Enamelled cast iron", dimensions: "24 cm diameter, 11 cm deep", color: "Burnt orange", weight: "4.1 kg", care: "Hand wash recommended. Dry fully before storing. Oven safe to 250°C.",
      specs: [["Capacity", "3.5 litres"], ["Hob compatibility", "Gas, electric, induction"], ["Lid", "Self-basting cast iron lid"], ["Oven safe", "Up to 250°C"]],
      description: "A heavy, evenly heating casserole for slow-cooked dals, biryanis and stews. The enamel interior does not need seasoning and releases food cleanly.", pop: 6, days: 120, tags: ["cookware", "giftable"], keywords: "dutch oven pot", max: 2,
    }),
    P("p-tumblers", "NRH-KIT-002", "Stoneware Tumbler Set of 4", "cat-tableware", "Kaali Studio", "Stoneware · 300 ml × 4", 1290, 22, "1610701596007-11502861dcfa", "Four speckled stoneware tumblers", {
      material: "Glazed stoneware", dimensions: "8 cm × 9 cm each", color: "Oat and sand", weight: "1.1 kg (set)", care: "Dishwasher and microwave safe.",
      specs: [["Capacity", "300 ml each"], ["Pieces", "4"], ["Finish", "Matte exterior, glazed interior"]],
      description: "Hand-glazed tumblers for chai, water or coffee. Each piece varies slightly in speckle and tone.", pop: 9, days: 70, tags: ["drinkware"], keywords: "cups glasses",
    }),
    P("p-plates", "NRH-KIT-003", "Speckled Dinner Plate Set of 4", "cat-tableware", "Kaali Studio", "Stoneware · 26 cm × 4", 2190, 9, "1578749556568-bc2c40e68b61", "Stacked blue-grey stoneware plates and bowls", {
      material: "Glazed stoneware", dimensions: "26 cm diameter", color: "Mist blue", weight: "3.2 kg (set)", care: "Dishwasher safe. Avoid sudden temperature changes.",
      specs: [["Pieces", "4 dinner plates"], ["Diameter", "26 cm"], ["Microwave safe", "Yes"]],
      description: "Generous dinner plates with a soft speckled glaze and a rolled rim that resists chipping.", pop: 5, days: 64, tags: ["dinnerware"],
    }),
    P("p-bowls", "NRH-KIT-004", "Nesting Serving Bowls, Set of 3", "cat-tableware", "Kaali Studio", "Stoneware · 3 sizes", 1590, 0, "1603199506016-b9a594b593c0", "Two patterned ceramic bowls stacked", {
      material: "Glazed stoneware", dimensions: "14, 17 and 20 cm", color: "Indigo pattern", weight: "1.8 kg (set)", care: "Dishwasher safe.",
      specs: [["Pieces", "3"], ["Sizes", "14 / 17 / 20 cm"]],
      description: "Three bowls that nest for storage, for serving dals, salads and rice.", pop: 4, days: 88, tags: ["serveware"],
    }),
    P("p-mug", "NRH-KIT-005", "Classic Porcelain Mug", "cat-tableware", "Kaali Studio", "Porcelain · 350 ml", 449, 40, "1514228742587-6b1558fcca3d", "Plain white porcelain mug", {
      material: "Porcelain", dimensions: "9 cm × 10 cm", color: "White", weight: "320 g", care: "Dishwasher and microwave safe.",
      specs: [["Capacity", "350 ml"], ["Handle", "Wide, three-finger"]],
      description: "A plain, sturdy mug with a wide handle and a lip that does not drip.", pop: 7, days: 150, tags: ["drinkware"], keywords: "cup coffee tea", max: 8,
    }),
    P("p-teapot", "NRH-KIT-006", "Clay Teapot & Cup Set", "cat-cookware", "Hearthline", "Clay · 600 ml", 1850, 6, "1564890369478-c89ca6d9cde9", "Ceramic teapot and cup on a wooden tray", {
      material: "Glazed clay", dimensions: "Teapot 16 cm wide", color: "Earth brown and white", weight: "1.3 kg", care: "Hand wash. Not for stovetop use.",
      specs: [["Teapot capacity", "600 ml"], ["Cups", "2"], ["Infuser", "Stainless steel, removable"]],
      description: "A small teapot with a removable infuser and two matching cups.", pop: 3, days: 25, tags: ["tea", "giftable"],
    }),
    P("p-vase", "NRH-HOM-001", "Matte Ceramic Vase Trio", "cat-home", "Mitti & Co.", "Ceramic · 3 heights", 2450, 11, "1565193566173-7a0ee3dbe261", "Three grey matte ceramic vases", {
      material: "Matte-glazed ceramic", dimensions: "18, 24 and 30 cm tall", color: "Slate grey", weight: "2.4 kg (set)", care: "Wipe clean. Interior glazed and watertight.",
      specs: [["Pieces", "3"], ["Watertight", "Yes"]],
      description: "Three bottle-neck vases in graduated heights for single stems or dried grasses.", pop: 6, days: 40, tags: ["decor", "giftable"],
    }),
    P("p-candle", "NRH-HOM-002", "Soy Wax Candle, Smoked Glass", "cat-home", "Lumen Lane", "Soy wax · 40 hr burn", 899, 30, "1602874801007-bd458bb1b8b6", "Lit candle in a smoked glass jar", {
      material: "Soy wax, cotton wick, smoked glass", dimensions: "8 cm × 9 cm", color: "Smoked grey", weight: "380 g", care: "Trim wick to 5 mm before each use. Never leave burning unattended.",
      specs: [["Burn time", "About 40 hours (tested)"], ["Scent", "Vetiver and cedar"]],
      description: "A clean-burning soy candle with a woody vetiver scent in a reusable smoked glass jar.", pop: 10, days: 95, tags: ["fragrance", "giftable"], returnable: false,
    }),
    P("p-lamp", "NRH-HOM-003", "Arc Desk Lamp, Graphite", "cat-home", "Lumen Lane", "Steel · E27", 3290, 4, "1507473885765-e6ed057f782c", "Graphite metal desk lamp", {
      material: "Powder-coated steel", dimensions: "Height 52 cm, base 16 cm", color: "Graphite", weight: "1.9 kg", care: "Dust with a dry cloth.",
      specs: [["Bulb", "E27, up to 40 W (not included)"], ["Cable", "1.8 m with switch"], ["Head", "Adjustable"]],
      description: "A weighted desk lamp with an adjustable head and a braided cable.", pop: 4, days: 18, tags: ["lighting"], keywords: "light reading",
    }),
    P("p-rug", "NRH-HOM-004", "Hand-tufted Wool Rug, 5 × 7 ft", "cat-home", "Loomhouse", "Wool · 5 × 7 ft", 8990, 3, "1600166898405-da9535204843", "Rolled patterned wool rug", {
      material: "80% wool, 20% cotton backing", dimensions: "152 × 213 cm", color: "Ivory and gold", weight: "7.5 kg", care: "Vacuum without beater bar. Professional clean only.",
      specs: [["Pile height", "10 mm"], ["Backing", "Cotton canvas"]],
      description: "A dense hand-tufted rug with a soft traditional border.", pop: 2, days: 55, tags: ["floor"], max: 1,
    }),
    P("p-cushion", "NRH-HOM-005", "Feather Cushion Insert, 18 in", "cat-home", "Loomhouse", "Feather fill · 45 cm", 690, 25, "1584100936595-c0654b55a2e2", "White cushion insert on a yellow background", {
      material: "Duck feather fill, cotton cover", dimensions: "45 × 45 cm", color: "White", weight: "650 g", care: "Spot clean. Fluff daily.",
      specs: [["Fill", "90% feather, 10% down"], ["Cover", "233 TC cotton"]],
      description: "A plump, full-bodied insert that holds its shape in any 18-inch cover.", pop: 5, days: 110, tags: ["soft furnishing"], keywords: "pillow",
    }),
    P("p-petbed", "NRH-PET-001", "Woven Seagrass Pet Bed", "cat-pets", "Pawsome Living", "Seagrass · medium", 2790, 8, "1600369671236-e74521d4b6ad", "Puppy sitting in a woven seagrass pet bed", {
      material: "Seagrass, cotton cushion", dimensions: "55 × 45 × 15 cm", color: "Natural", weight: "2.2 kg", care: "Cushion cover machine washable at 30°C.",
      specs: [["Suitable for", "Small and medium dogs, cats"], ["Cushion", "Removable, washable cover"]],
      description: "A low woven bed with a washable cushion, sized for small and medium dogs.", pop: 6, days: 60, tags: ["dogs", "cats"],
    }),
    P("p-hoodie", "NRH-PET-002", "Fleece Pet Hoodie", "cat-pets", "Pawsome Living", "Fleece · size M", 799, 15, "1583337130417-3346a1be7dee", "French bulldog wearing a yellow fleece hoodie", {
      material: "Polyester fleece", dimensions: "Size M: chest 50 cm, back 35 cm", color: "Mustard", weight: "160 g", care: "Machine wash cold. Do not tumble dry.",
      specs: [["Size", "M (chest 50 cm)"], ["Closure", "Pull-over"]],
      description: "A soft hoodie for cold mornings, with a leash opening at the back.", pop: 4, days: 30, tags: ["dogs"], keywords: "dog jacket sweater",
    }),
    P("p-hammock", "NRH-PET-003", "Canvas Pet Hammock", "cat-pets", "Pawsome Living", "Canvas · 50 kg load", 1490, 5, "1585664811087-47f65abbad64", "Small dog relaxing in a striped canvas hammock", {
      material: "Cotton canvas, steel frame", dimensions: "70 × 50 × 45 cm", color: "Green stripe", weight: "3 kg", care: "Canvas removable and hand washable.",
      specs: [["Max load", "25 kg"], ["Assembly", "Tool-free, 5 minutes"]],
      description: "A raised hammock that keeps pets off cold floors.", pop: 3, days: 12, tags: ["dogs"],
    }),
    P("p-catblanket", "NRH-PET-004", "Calming Cat Blanket", "cat-pets", "Pawsome Living", "Plush · 70 × 60 cm", 1190, 0, "1514888286974-6c03e2ca1dba", "Black and white cat resting on a table", {
      material: "Plush polyester", dimensions: "70 × 60 cm", color: "Sage", weight: "400 g", care: "Machine wash gentle.",
      specs: [["Suitable for", "Cats and small dogs"]],
      description: "A deep-pile blanket that cats can knead and nest in.", pop: 3, days: 80, tags: ["cats"],
    }),
    P("p-tee", "NRH-TEX-001", "Organic Cotton Crew Tee", "cat-textiles", "Loomhouse", "Organic cotton · 180 gsm", 999, 35, "1521572163474-6864f9cf17ab", "Person wearing a plain white crew-neck tee", {
      material: "100% organic cotton", dimensions: "Regular fit, sizes S–XL", color: "White", weight: "180 gsm", care: "Machine wash cold, dry in shade.",
      specs: [["Fabric weight", "180 gsm"], ["Fit", "Regular"], ["Sizes", "S, M, L, XL"]],
      description: "A mid-weight everyday tee with a durable rib collar that keeps its shape.", pop: 8, days: 140, tags: ["apparel"], keywords: "t-shirt top", max: 6,
    }),
    P("p-poncho", "NRH-TEX-002", "Hand-knit Cotton Poncho", "cat-textiles", "Loomhouse", "Cotton knit · free size", 2290, 7, "1434389677669-e08b4cac3105", "Cream hand-knit poncho on a hanger", {
      material: "100% cotton yarn", dimensions: "Free size, 75 cm length", color: "Cream", weight: "450 g", care: "Hand wash cold, dry flat.",
      specs: [["Knit", "Open hand-knit"], ["Size", "Free size"]],
      description: "A light open-knit poncho for layering on cooler evenings.", pop: 3, days: 8, tags: ["apparel"],
    }),
    P("p-shirt", "NRH-TEX-003", "Everyday Linen Shirt, Sage", "cat-textiles", "Loomhouse", "Linen · relaxed fit", 2490, 12, "1523381210434-271e8be1f52b", "Sage linen shirts on wooden hangers", {
      material: "100% linen", dimensions: "Relaxed fit, sizes S–XL", color: "Sage", weight: "160 gsm", care: "Machine wash gentle, line dry.",
      specs: [["Fabric", "Pre-washed linen"], ["Sizes", "S, M, L, XL"]],
      description: "A pre-washed linen shirt that softens with every wash.", pop: 5, days: 20, tags: ["apparel"],
    }),
    P("p-bag", "NRH-TEX-004", "Leather Crossbody Bag, Tan", "cat-textiles", "Saddle Row", "Leather · adjustable strap", 3990, 6, "1600857062241-98e5dba7f214", "Tan leather crossbody bag", {
      material: "Full-grain leather, cotton lining", dimensions: "24 × 17 × 7 cm", color: "Tan", weight: "540 g", care: "Condition every 3 months. Keep dry.",
      specs: [["Strap", "Adjustable, 110–130 cm"], ["Pockets", "1 zip, 2 slip"]],
      description: "A compact crossbody in vegetable-tanned leather that darkens with use.", pop: 4, days: 50, tags: ["bags", "giftable"],
    }),
    P("p-bottle", "NRH-ESS-001", "Insulated Steel Bottle, 750 ml", "cat-essentials", "Everkeep", "Steel · 750 ml", 1190, 45, "1602143407151-7111542de6e8", "Sage green insulated steel bottle", {
      material: "18/8 stainless steel, powder coat", dimensions: "7.5 × 26 cm", color: "Sage", weight: "390 g", care: "Hand wash. Not dishwasher safe.",
      specs: [["Capacity", "750 ml"], ["Keeps cold", "Up to 24 hours (manufacturer test)"], ["Keeps hot", "Up to 12 hours (manufacturer test)"]],
      description: "A double-walled bottle with a leak-proof lid and a powder-coated grip.", pop: 10, days: 100, tags: ["hydration"], keywords: "flask water",
    }),
    P("p-faceoil", "NRH-ESS-002", "Botanical Face Oil, 30 ml", "cat-essentials", "Verdant", "Plant oils · 30 ml", 1450, 18, "1608571423902-eed4a5ad8108", "Amber glass dropper bottle on a wooden stand", {
      material: "Jojoba, rosehip and squalane", dimensions: "30 ml dropper bottle", color: "Amber glass", weight: "120 g", care: "Store away from direct sunlight. Use within 12 months of opening.",
      specs: [["Skin type", "Normal to dry"], ["Fragrance", "Unscented"]],
      description: "A lightweight blend of plant oils for evening use.", pop: 5, days: 35, tags: ["skincare"], returnable: false,
    }),
    P("p-lotion", "NRH-ESS-003", "Daily Body Lotion, 200 ml", "cat-essentials", "Verdant", "Shea butter · 200 ml", 590, 28, "1620916566398-39f1143ab7be", "White lotion tube on soft fabric", {
      material: "Shea butter and aloe", dimensions: "200 ml tube", color: "White", weight: "230 g", care: "Use within 12 months of opening.",
      specs: [["Skin type", "All skin types"], ["Fragrance", "Light, natural"]],
      description: "A fast-absorbing everyday lotion that does not feel greasy.", pop: 6, days: 45, tags: ["skincare"], returnable: false,
    }),
    P("p-selfcare", "NRH-ESS-004", "Self-care Starter Kit", "cat-essentials", "Verdant", "4-piece set", 2490, 9, "1612817288484-6f916006741a", "Flat lay of skincare bottles and jars", {
      material: "Assorted", dimensions: "Gift box 25 × 18 × 8 cm", color: "Forest green", weight: "850 g", care: "See individual product labels.",
      specs: [["Includes", "Face oil, balm, cleanser, body scrub"]],
      description: "Four Verdant favourites in a reusable gift box.", pop: 4, days: 6, tags: ["skincare", "giftable"], returnable: false,
    }),
    P("p-spices", "NRH-PAN-001", "Whole Spice Collection, 8 Jars", "cat-pantry", "Spice Route Co.", "8 spices · 400 g", 1350, 16, "1596040033229-a9821ebd058d", "Whole spices and chillies arranged on white", {
      material: "Whole spices in glass jars", dimensions: "8 jars, 50 g each", color: "Assorted", weight: "1.1 kg", care: "Store in a cool, dry place. Best before 12 months from packing.",
      specs: [["Includes", "Cardamom, clove, cinnamon, cumin, coriander, peppercorn, star anise, bay leaf"], ["Shelf life", "12 months"]],
      description: "Eight everyday whole spices sourced from named farms and packed in airtight glass.", pop: 6, days: 75, tags: ["spices"], taxClass: "essential", returnable: false,
    }),
    P("p-coffee", "NRH-PAN-002", "Single-Origin Coffee Beans, 250 g", "cat-pantry", "Hillside Roasters", "Medium roast · 250 g", 690, 24, "1559056199-641a0ac8b55e", "Kraft coffee bag on a grey surface", {
      material: "100% arabica beans", dimensions: "250 g valve bag", color: "—", weight: "260 g", care: "Store sealed, away from light. Best within 4 weeks of opening.",
      specs: [["Origin", "Chikmagalur, Karnataka"], ["Roast", "Medium"], ["Tasting notes", "Cocoa, orange, brown sugar"]],
      description: "Whole beans roasted in small batches every week.", pop: 9, days: 90, tags: ["coffee"], taxClass: "essential", returnable: false, keywords: "beans arabica",
    }),
    P("p-espresso", "NRH-PAN-003", "Espresso Roast, 500 g", "cat-pantry", "Hillside Roasters", "Dark roast · 500 g", 1190, 12, "1497935586351-b67a49e012bf", "Coffee beans and an espresso portafilter on wood", {
      material: "Arabica and robusta blend", dimensions: "500 g valve bag", color: "—", weight: "510 g", care: "Store sealed, away from light.",
      specs: [["Roast", "Dark"], ["Best for", "Espresso, moka pot"]],
      description: "A chocolatey dark roast built for espresso and milk drinks.", pop: 5, days: 15, tags: ["coffee"], taxClass: "essential", returnable: false,
    }),
    P("p-tea", "NRH-PAN-004", "Assam Orthodox Tea, 100 g", "cat-pantry", "Hillside Roasters", "Loose leaf · 100 g", 420, 30, "1544787219-7f47ccb76574", "Cup of milk tea with cookies", {
      material: "Whole-leaf black tea", dimensions: "100 g tin", color: "—", weight: "150 g", care: "Store airtight.",
      specs: [["Grade", "TGFOP"], ["Brewing", "3–4 minutes at 95°C"]],
      description: "Malty, full-bodied whole-leaf tea from a single estate.", pop: 4, days: 130, tags: ["tea"], taxClass: "essential", returnable: false,
    }),
    P("p-printink", "NRH-ART-001", "Abstract Ink Art Print, A3", "cat-gifts", "Paper Moon", "Archival print · A3", 1890, 10, "1567095761054-7a02e69e5c43", "Abstract blue and red ink artwork", {
      material: "Giclée on 300 gsm cotton paper", dimensions: "29.7 × 42 cm (unframed)", color: "Blue and red", weight: "120 g", care: "Frame behind UV-protective glass.",
      specs: [["Edition", "Open edition"], ["Frame", "Not included"]],
      description: "An archival print of an original ink study.", pop: 3, days: 28, tags: ["prints", "giftable"],
    }),
    P("p-printbotanical", "NRH-ART-002", "Botanical Still Life Print, A3", "cat-gifts", "Paper Moon", "Archival print · A3", 1890, 2, "1579783902614-a3fb3927b6a5", "Dark floral still life painting", {
      material: "Giclée on 300 gsm cotton paper", dimensions: "29.7 × 42 cm (unframed)", color: "Deep green and red", weight: "120 g", care: "Frame behind UV-protective glass.",
      specs: [["Edition", "Open edition"], ["Frame", "Not included"]],
      description: "A rich still-life reproduction printed on cotton rag paper.", pop: 3, days: 48, tags: ["prints", "giftable"],
    }),
    P("p-giftbox", "NRH-ART-003", "Signature Gift Box", "cat-gifts", "NIRAH", "Curated · 5 items", 2990, 12, "1513201099705-a9746e1e201f", "Kraft-wrapped gift with a pink ribbon", {
      material: "Assorted", dimensions: "30 × 22 × 10 cm", color: "Kraft and pink", weight: "1.4 kg", care: "See item labels.",
      specs: [["Includes", "Candle, mug, tea, notebook, card"], ["Gift note", "Free handwritten note"]],
      description: "Five NIRAH favourites, gift-wrapped with a handwritten note.", pop: 7, days: 65, tags: ["gift"], keywords: "present hamper",
    }),
    P("p-brushes", "NRH-ART-004", "Artist Brush Set of 8", "cat-gifts", "Paper Moon", "Synthetic · 8 brushes", 990, 20, "1460661419201-fd4cecdf8a8b", "Paint brushes with colourful paint", {
      material: "Synthetic bristles, birch handles", dimensions: "Sizes 0–12", color: "Natural", weight: "140 g", care: "Rinse after use and reshape tips.",
      specs: [["Brushes", "8 (round and flat)"], ["Suitable for", "Watercolour, acrylic, gouache"]],
      description: "A versatile starter set of round and flat brushes.", pop: 3, days: 4, tags: ["art supplies"],
    }),
    // Not yet live: one waiting for approval, one still a draft (AC-02).
    P("p-pendant", "NRH-HOM-006", "Copper Dome Pendant Light", "cat-home", "Lumen Lane", "Copper · E27", 3890, 6, "1540932239986-30128078f3c5", "Copper dome pendant lights", {
      material: "Spun copper", dimensions: "Ø 28 cm, 1.2 m drop", color: "Copper", weight: "1.6 kg", care: "Dust with a dry cloth.",
      specs: [["Bulb", "E27 (not included)"]], description: "A spun copper pendant with a warm glow.", status: "pending", days: 2, pop: 0,
    }),
    P("p-runner", "NRH-HOM-007", "Linen Table Runner", "cat-home", "Loomhouse", "Linen · 180 cm", 1290, 0, "1556228453-efd6c1ff04f6", "Living room with a macramé wall hanging", {
      material: "Linen", dimensions: "35 × 180 cm", color: "Natural", weight: "300 g", care: "Machine wash gentle.",
      specs: [], description: "Draft listing — copy and photos in progress.", status: "draft", days: 1, pop: 0,
    }),
  ];

  const promotions = (now) => [
    { id: "promo-mug", name: "Mug markdown", type: "product", mode: "percent", value: 15, skus: ["NRH-KIT-005"], startsAt: now - 20 * DAY, endsAt: now + 25 * DAY },
    { id: "promo-bottle", name: "Hydration week", type: "product", mode: "percent", value: 20, skus: ["NRH-ESS-001"], startsAt: now - 3 * DAY, endsAt: now + 4 * DAY },
    { id: "promo-pets", name: "Pet comfort", type: "category", mode: "percent", value: 10, categoryIds: ["cat-pets"], excludeSkus: ["NRH-PET-003"], startsAt: now - 10 * DAY, endsAt: now + 20 * DAY },
    { id: "promo-festive", name: "Festive Home Edit", type: "campaign", mode: "percent", value: 20, categoryIds: ["cat-home", "cat-gifts"], skus: [], startsAt: now - 5 * DAY, endsAt: now + 9 * DAY, banner: "Up to 20% off home décor and gifts, for a limited time.", image: U("1513201099705-a9746e1e201f") },
    { id: "promo-winter", name: "Winter Textiles", type: "campaign", mode: "percent", value: 15, categoryIds: ["cat-textiles"], skus: [], startsAt: now + 7 * DAY, endsAt: now + 30 * DAY, banner: "Layers for cooler days.", image: U("1490481651871-ab68de25d43d") },
    { id: "promo-monsoon", name: "Monsoon Kitchen", type: "campaign", mode: "fixed", value: 200, categoryIds: ["cat-kitchen"], skus: [], startsAt: now - 40 * DAY, endsAt: now - 8 * DAY, banner: "Ended.", image: U("1556911220-bff31c812dba") },
    { id: "promo-welcome", name: "Welcome offer", type: "coupon", mode: "percent", value: 10, code: "WELCOME10", minSpend: 1500, usageLimit: 500, perCustomerLimit: 1, startsAt: now - 60 * DAY, endsAt: now + 120 * DAY, public: true },
    { id: "promo-flat250", name: "Flat ₹250 off", type: "coupon", mode: "fixed", value: 250, code: "FLAT250", minSpend: 2500, usageLimit: 200, perCustomerLimit: 2, startsAt: now - 15 * DAY, endsAt: now + 15 * DAY, public: true },
  ].map((p) => ({ active: true, skus: [], categoryIds: [], excludeSkus: [], used: 0, allowBelowFloor: false, createdBy: "Meera Iyer", ...p }));

  const content = {
    hero: {
      title: "Curated for\nEvery Lifestyle",
      text: "Thoughtfully selected products for everyday living. Every item is reviewed for quality, priced honestly and shipped from our own stock.",
      primary: "Shop All",
      secondary: "Explore Categories",
    },
    promises: [
      ["shield", "Every product reviewed\nbefore it is listed"],
      ["box", "Only in-stock items,\nno backorders"],
      ["tag", "Clear specs and\nhonest pricing"],
      ["lock", "Secure online payment\nthrough our gateway"],
      ["refresh", "Easy returns on\neligible items"],
    ],
    sections: [
      { key: "categories", label: "Shop by category", visible: true },
      { key: "popular", label: "Popular now", visible: true },
      { key: "offers", label: "Seasonal offers", visible: true },
      { key: "new", label: "New arrivals", visible: true },
      { key: "featured", label: "Selected for you", visible: true },
      { key: "promise", label: "Quality promise", visible: true },
      { key: "reviews", label: "Customer reviews", visible: true },
    ],
    pinned: ["p-vase", "p-giftbox", "p-casserole", "p-bag"],
    about: {
      title: "Fewer, better things",
      intro: "NIRAH is a curated store for everyday living. We do not try to sell everything. We choose a small range of products we would use ourselves, check them carefully and keep them in our own stock before we list them.",
      story: "We started NIRAH because shopping online had become a scroll through endless lookalike listings. We wanted a store where every product earns its place: honest photos, specifications you can rely on and a price that makes sense for what you get.",
      standards: [
        ["Sourcing", "We note where each product comes from, who it is for and why it fits the range before we buy it."],
        ["Inspection", "Every delivery is counted and checked. Damaged units are set aside and never sold as new."],
        ["Listing", "Real photos, exact sizes and materials, care instructions and return eligibility on every page."],
        ["Approval", "A catalogue owner signs off on the copy, photos, price and stock before anything goes live."],
        ["After sale", "We watch returns, ratings and complaints, and pull products that do not hold up."],
      ],
      delivery: "We only sell what is on our shelves, so your order is packed from stock we hold. Delivery estimates are shown at checkout based on your pincode.",
    },
    faqs: [
      ["Do you sell items that are out of stock?", "No. NIRAH only sells products that are physically in our stock. If an item shows as out of stock you cannot order it, and we never take backorders or pre-orders."],
      ["How long does delivery take?", "Estimated delivery times depend on your pincode and are shown on the product page and at checkout. They are estimates, not guarantees."],
      ["How do returns work?", "Eligible items can be returned within the return window shown on the product page. Some items, such as skincare and food, cannot be returned once opened for hygiene reasons."],
      ["Which payment methods do you accept?", "UPI, cards and net banking through our payment partner. We never see or store your card details."],
      ["Can I check out without an account?", "Yes. Guest checkout is available, and you can look up a guest order with your order number and email address."],
      ["Who can review a product?", "Only customers who bought and received the product can rate it, so every review comes from a verified purchase."],
    ],
    policies: {
      shipping: "We ship from our own warehouse across India. Shipping fees and estimated delivery times depend on your pincode and are shown before you pay. Orders are dispatched only after payment is confirmed. You will receive a tracking link once your order ships.\n\nDraft policy: final serviceable pincodes, fees and timelines are to be confirmed by the business.",
      returns: "Eligible items can be returned within 7 days of delivery in unused condition with original packaging. Items marked non-returnable (such as opened skincare and food) cannot be returned unless they arrive damaged or defective. Returned items are inspected before a refund is issued to your original payment method.\n\nDraft policy: final windows and conditions are to be confirmed by the business.",
      privacy: "We collect only the information needed to process your order and support you: your name, contact details, delivery address and order history. Payment details are handled by our payment partner and never stored by NIRAH. Marketing messages are sent only if you opt in, separately from order updates.\n\nDraft policy pending legal review.",
      terms: "By placing an order you agree to pay the total shown at checkout. Prices include applicable GST. An order is confirmed only when our payment partner confirms your payment. We may cancel and fully refund an order if an item becomes unavailable.\n\nDraft terms pending legal review.",
    },
  };

  const admins = [
    ["adm-owner", "Meera Iyer", "owner@nirah.demo", "owner"],
    ["adm-cat", "Rohan Das", "catalogue@nirah.demo", "catalogue"],
    ["adm-inv", "Sana Khan", "inventory@nirah.demo", "inventory"],
    ["adm-ful", "Vikram Rao", "fulfilment@nirah.demo", "fulfilment"],
    ["adm-sup", "Priya Nair", "support@nirah.demo", "support"],
    ["adm-fin", "Arjun Mehta", "finance@nirah.demo", "finance"],
    ["adm-ana", "Leela Joseph", "analyst@nirah.demo", "analyst"],
  ];

  const people = [
    "Ananya Sharma", "Rahul Menon", "Kavya Reddy", "Arjun Nair", "Ishita Banerjee", "Siddharth Rao", "Neha Kulkarni", "Vivek Pillai",
    "Pooja Shah", "Karan Malhotra", "Divya Krishnan", "Aditya Joshi", "Meghna Das", "Nikhil Gupta", "Sneha Patil", "Rohit Agarwal",
    "Tara Fernandes", "Harsh Vardhan", "Lakshmi Subramanian", "Farhan Qureshi", "Riya Kapoor", "Manish Tiwari", "Zoya Mirza", "Gautam Bose",
  ];
  const places = [
    ["Bengaluru", "560034", "Karnataka"], ["Mumbai", "400050", "Maharashtra"], ["Chennai", "600040", "Tamil Nadu"], ["New Delhi", "110017", "Delhi"],
    ["Hyderabad", "500033", "Telangana"], ["Pune", "411038", "Maharashtra"], ["Kolkata", "700019", "West Bengal"], ["Kochi", "682020", "Kerala"],
    ["Jaipur", "302017", "Rajasthan"], ["Ahmedabad", "380015", "Gujarat"],
  ];
  const streets = ["14 Lake View Road", "7B Palm Grove", "22 Temple Street", "301 Sunrise Apartments", "9 MG Road", "56 Park Avenue", "18 Rose Lane"];

  const reviewText = {
    5: [["Exactly as described", "Quality is excellent and it matched the photos and measurements exactly."], ["Worth it", "Well made and arrived carefully packed. Would buy again."], ["Lovely", "Looks even better in person. Very happy with this."]],
    4: [["Very good", "Good quality for the price. Delivery took a day longer than the estimate."], ["Happy with it", "Does what it should. Packaging could use less plastic."]],
    3: [["Okay", "Decent, but the colour is slightly different from the photos."], ["Average", "It is fine. Expected a little more for the price."]],
    2: [["Not for me", "Smaller than I expected even though the size was listed. Returned it."]],
    1: [["Disappointed", "Arrived with a chip on the rim. Support replaced it quickly though."]],
  };

  function mulberry(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Builds the whole demo database. `hash(password)` returns {salt, hash}.
  N.seed = async function seed({ hash, taxOf }) {
    const now = Date.now();
    const rng = mulberry(20261023);
    const pick = (list) => list[Math.floor(rng() * list.length)];
    const ids = { order: 10001, case: 1, review: 1, movement: 1, payment: 1, refund: 1, event: 1, audit: 1 };
    const next = (k, prefix) => `${prefix}-${ids[k]++}`;

    const db = {
      version: 1,
      createdAt: now,
      settings: JSON.parse(JSON.stringify(settings)),
      categories: JSON.parse(JSON.stringify(categories)),
      products: [],
      inventory: {},
      reservations: [],
      movements: [],
      promotions: promotions(now),
      customers: [],
      orders: [],
      payments: [],
      webhookEvents: [],
      refunds: [],
      reviews: [],
      cases: [],
      content: { published: JSON.parse(JSON.stringify(content)), draft: JSON.parse(JSON.stringify(content)), publishedAt: now - 3 * DAY },
      admins: [],
      audit: [],
      ids,
    };

    for (const p of products) {
      const { stock, pop, days, max, ...rest } = p;
      db.products.push({
        slug: p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        taxClass: "standard",
        returnable: true,
        tags: [],
        keywords: "",
        specs: [],
        featuredRank: 0,
        minPrice: null,
        seoTitle: "",
        seoDescription: "",
        status: "published",
        ...rest,
        maxPerOrder: max || 5,
        createdAt: now - (days + 3) * DAY,
        publishedAt: rest.status && rest.status !== "published" ? null : now - days * DAY,
        updatedAt: now - days * DAY,
        quality: {
          sourcing: true,
          inspection: rest.status !== "draft",
          listing: rest.status !== "draft",
          approved: !rest.status || rest.status === "published",
          approvedBy: !rest.status || rest.status === "published" ? "Meera Iyer" : "",
          notes: rest.status === "pending" ? "Inspection done; awaiting catalogue owner sign-off." : "",
        },
      });
      db.inventory[p.sku] = { onHand: 0, quarantine: 0, committed: 0, reorder: p.sku === "NRH-HOM-004" ? 2 : 5, lastReceipt: now - (days + 2) * DAY, _target: stock, _pop: pop };
    }

    for (const [id, name, email, role] of admins) {
      db.admins.push({ id, name, email, role, active: true, ...(await hash("demo1234")) });
    }

    // Customers: one demo account with a password, the rest are guest buyers.
    const asha = {
      id: "cus-asha",
      name: "Asha Verma",
      email: "asha@example.com",
      phone: "9876543210",
      marketingConsent: true,
      createdAt: now - 90 * DAY,
      addresses: [{ id: "addr-1", label: "Home", name: "Asha Verma", phone: "9876543210", line1: "4 Cubbon Park Road", line2: "Flat 12B", city: "Bengaluru", state: "Karnataka", pincode: "560001" }],
      ...(await hash("demo1234")),
    };
    db.customers.push(asha);
    people.forEach((name, i) => {
      const [city, pincode, state] = places[i % places.length];
      const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`;
      db.customers.push({
        id: `cus-${i + 1}`,
        name,
        email,
        phone: `98${String(10000000 + Math.floor(rng() * 89999999))}`,
        marketingConsent: rng() < 0.45,
        createdAt: now - (60 + i) * DAY,
        addresses: [{ id: `addr-g${i}`, label: "Home", name, phone: "", line1: pick(streets), line2: "", city, state, pincode }],
        salt: null,
        hash: null,
      });
    });

    const live = db.products.filter((p) => p.status === "published");
    const weighted = live.flatMap((p) => Array(db.inventory[p.sku]._pop).fill(p));
    const shipped = {};
    const returned = {};
    const committed = {};
    const add = (map, sku, q) => (map[sku] = (map[sku] || 0) + q);

    const lineFor = (p, qty) => {
      const rate = taxOf(db, p);
      const total = p.price * qty;
      return {
        productId: p.id,
        sku: p.sku,
        title: p.title,
        image: p.images[0].src,
        short: p.short,
        qty,
        regular: p.price,
        unit: p.price,
        promoId: null,
        promoName: "",
        taxRate: rate,
        tax: Math.round((total - total / (1 + rate / 100)) * 100) / 100,
        returnable: p.returnable,
      };
    };

    const makeOrder = (customer, t, items, status, extra = {}) => {
      const lines = items.map(([p, q]) => lineFor(p, q));
      const merchandise = lines.reduce((s, l) => s + l.unit * l.qty, 0);
      const zone = customer.addresses[0].pincode.startsWith("5600") || ["110", "400", "600", "700", "500", "411", "380", "560"].some((x) => customer.addresses[0].pincode.startsWith(x)) ? db.settings.shipping.zones[0] : db.settings.shipping.zones[1];
      const shipping = merchandise >= zone.freeAbove ? 0 : zone.fee;
      const id = next("order", "NRH");
      const order = {
        id,
        token: Math.random().toString(36).slice(2, 12),
        customerId: customer.salt ? customer.id : null,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: { ...customer.addresses[0] },
        lines,
        regularTotal: merchandise,
        autoDiscount: 0,
        coupon: null,
        merchandise,
        shipping,
        shippingZone: zone.name,
        eta: zone.eta,
        tax: lines.reduce((s, l) => s + l.tax, 0) + Math.round((shipping - shipping / 1.18) * 100) / 100,
        total: merchandise + shipping,
        status,
        paymentState: "paid",
        method: pick(["upi", "upi", "card", "netbanking"]),
        createdAt: t,
        history: [],
        courier: "",
        trackingId: "",
        notes: [],
        cancelRequest: null,
        returnRequest: null,
        marketingConsent: customer.marketingConsent,
        ...extra,
      };
      const step = (s, dt, by = "System", note = "") => order.history.push({ status: s, at: t + dt, by, note });
      step("Placed", 0, "Customer");
      const payId = next("payment", "pay");
      const txn = `sbx_txn_${(1e9 + Math.floor(rng() * 9e9)).toString(36)}`;
      if (status !== "Placed") {
        step("Paid", 2 * 60000, "Gateway webhook");
        db.payments.push({ id: payId, orderId: id, sessionId: `ps_${payId}`, attempt: 1, method: order.method, amount: order.total, state: "captured", gatewayTxnId: txn, createdAt: t, updatedAt: t + 2 * 60000 });
      }
      const flow = ["Processing", "Packed", "Shipped", "Delivered"];
      const reach = { Paid: 0, Processing: 1, Packed: 2, Shipped: 3, Delivered: 4, "Return Requested": 4, Returned: 4, Refunded: 4 }[status] ?? 0;
      flow.slice(0, reach).forEach((s, i) => step(s, (i + 1) * 0.6 * DAY, pick(["Vikram Rao", "Vikram Rao", "Meera Iyer"])));
      if (reach >= 3) {
        order.courier = pick(["Delhivery", "Blue Dart", "Ekart"]);
        order.trackingId = `TRK${Math.floor(1e8 + rng() * 9e8)}`;
        lines.forEach((l) => add(shipped, l.sku, l.qty));
      }
      if (reach === 1 || reach === 2 || status === "Paid") lines.forEach((l) => add(committed, l.sku, l.qty));
      return { order, payId, txn };
    };

    for (let i = 0; i < 150; i += 1) {
      const daysAgo = Math.floor(Math.pow(rng(), 0.85) * 60);
      const t = now - daysAgo * DAY - Math.floor(rng() * 10) * 3600000 - 3600000;
      const customer = db.customers[1 + Math.floor(rng() * people.length)];
      const count = rng() < 0.65 ? 1 : rng() < 0.7 ? 2 : 3;
      const chosen = new Map();
      for (let k = 0; k < count; k += 1) {
        const p = pick(weighted);
        chosen.set(p, (chosen.get(p) || 0) + (rng() < 0.82 ? 1 : 2));
      }
      let items = [...chosen];
      let status;
      const r = rng();
      if (daysAgo >= 8) status = r < 0.06 ? "Cancelled" : r < 0.11 ? "Refunded" : r < 0.13 ? "Return Requested" : "Delivered";
      else if (daysAgo >= 4) status = r < 0.55 ? "Delivered" : "Shipped";
      else if (daysAgo >= 2) status = r < 0.5 ? "Shipped" : "Packed";
      else if (daysAgo >= 1) status = r < 0.5 ? "Processing" : "Paid";
      else status = r < 0.8 ? "Paid" : "Placed";
      // Out-of-stock items can't be in open orders.
      if (["Paid", "Processing", "Packed", "Placed"].includes(status)) {
        items = items.filter(([p]) => db.inventory[p.sku]._target > 0);
        if (!items.length) continue;
      }

      const { order, payId, txn } = makeOrder(customer, t, items, status === "Cancelled" ? "Paid" : status);
      if (status === "Cancelled") {
        order.lines.forEach((l) => (committed[l.sku] -= l.qty));
        order.status = "Cancelled";
        order.paymentState = "refunded";
        order.history.push({ status: "Cancelled", at: t + 0.3 * DAY, by: "Priya Nair", note: "Customer asked to cancel: ordered by mistake" });
        const rid = next("refund", "ref");
        db.refunds.push({ id: rid, orderId: order.id, paymentId: payId, amount: order.total, reason: "Order cancelled before dispatch", state: "processed", requestedBy: "Priya Nair", approvedBy: "Arjun Mehta", createdAt: t + 0.3 * DAY, processedAt: t + 0.5 * DAY, gatewayRef: `sbx_rfnd_${rid}` });
        db.payments.find((p) => p.id === payId).state = "refunded";
      }
      if (status === "Placed") {
        order.paymentState = rng() < 0.5 ? "failed" : "expired";
        order.history.push({ status: "Placed", at: t + 11 * 60000, by: "System", note: order.paymentState === "failed" ? "Payment failed at gateway; stock released" : "Payment window expired; stock released" });
        db.payments.push({ id: payId, orderId: order.id, sessionId: `ps_${payId}`, attempt: 1, method: order.method, amount: order.total, state: order.paymentState, gatewayTxnId: order.paymentState === "failed" ? txn : "", createdAt: t, updatedAt: t + 10 * 60000 });
      }
      if (status === "Return Requested" || status === "Refunded") {
        const reason = pick(["Size smaller than expected", "Colour differs from photos", "Arrived damaged", "Changed my mind"]);
        order.returnRequest = { reason, at: t + 6 * DAY, state: status === "Refunded" ? "completed" : "requested" };
        order.history.push({ status: "Return Requested", at: t + 6 * DAY, by: "Customer", note: reason });
        if (status === "Refunded") {
          order.history.push({ status: "Returned", at: t + 8 * DAY, by: "Sana Khan", note: "Received and inspected" });
          order.history.push({ status: "Refunded", at: t + 9 * DAY, by: "Arjun Mehta" });
          order.paymentState = "refunded";
          order.lines.forEach((l) => add(returned, l.sku, l.qty));
          const rid = next("refund", "ref");
          db.refunds.push({ id: rid, orderId: order.id, paymentId: payId, amount: order.merchandise, reason: `Return: ${reason}`, state: "processed", requestedBy: "Priya Nair", approvedBy: "Arjun Mehta", createdAt: t + 8 * DAY, processedAt: t + 9 * DAY, gatewayRef: `sbx_rfnd_${rid}` });
          db.payments.find((p) => p.id === payId).state = "refunded";
        }
      }
      db.orders.push(order);

      // Verified reviews from delivered orders.
      if (status === "Delivered") {
        for (const line of order.lines) {
          if (rng() > 0.42) continue;
          const roll = rng();
          const rating = roll < 0.55 ? 5 : roll < 0.84 ? 4 : roll < 0.94 ? 3 : roll < 0.985 ? 2 : 1;
          const [title, body] = pick(reviewText[rating]);
          const at = t + (6 + rng() * 6) * DAY;
          if (at > now) continue;
          const pending = now - at < 3 * DAY;
          db.reviews.push({
            id: next("review", "rev"),
            productId: line.productId,
            orderId: order.id,
            customerId: customer.id,
            name: customer.name.split(" ")[0] + " " + customer.name.split(" ")[1][0] + ".",
            rating,
            title,
            body,
            state: pending ? "pending" : "approved",
            reply: rating <= 2 ? "Thank you for telling us. We have shared this with our quality team and checked the remaining stock." : "",
            createdAt: at,
            moderation: pending ? [] : [{ action: "approved", by: "Priya Nair", at: at + DAY, reason: "" }],
          });
        }
      }
    }

    // Asha's own history: a delivered order she can review, one on its way.
    const byId = (id) => db.products.find((p) => p.id === id);
    {
      const { order } = makeOrder(asha, now - 12 * DAY, [[byId("p-tumblers"), 1], [byId("p-candle"), 2]], "Delivered");
      order.customerId = asha.id;
      db.orders.push(order);
      const second = makeOrder(asha, now - 2 * DAY, [[byId("p-bottle"), 1]], "Shipped");
      second.order.customerId = asha.id;
      db.orders.push(second.order);
    }

    // Stock ledger consistent with the history above.
    for (const p of db.products) {
      const inv = db.inventory[p.sku];
      inv.committed = Math.max(0, committed[p.sku] || 0);
      inv.onHand = inv._target + inv.committed;
      const ship = shipped[p.sku] || 0;
      const ret = returned[p.sku] || 0;
      const receipt = inv.onHand + ship - ret;
      if (receipt > 0) {
        db.movements.push({ id: next("movement", "mv"), sku: p.sku, type: "receipt", qty: receipt, reason: "Opening stock, QC passed", ref: "GRN-0001", actor: "Sana Khan", at: inv.lastReceipt });
      }
      if (ship) db.movements.push({ id: next("movement", "mv"), sku: p.sku, type: "ship", qty: -ship, reason: "Dispatched orders (summary)", ref: "Seed history", actor: "Vikram Rao", at: now - 3 * DAY });
      if (ret) {
        db.movements.push({ id: next("movement", "mv"), sku: p.sku, type: "return", qty: ret, reason: "Customer returns to quarantine", ref: "Seed history", actor: "Sana Khan", at: now - 6 * DAY });
        db.movements.push({ id: next("movement", "mv"), sku: p.sku, type: "inspect-approve", qty: ret, reason: "Inspected, resaleable", ref: "Seed history", actor: "Sana Khan", at: now - 5 * DAY });
      }
      delete inv._target;
      delete inv._pop;
    }
    db.movements.push({ id: next("movement", "mv"), sku: "NRH-KIT-004", type: "adjustment", qty: 0, reason: "Cycle count: all units sold, awaiting new batch", ref: "CC-0042", actor: "Sana Khan", at: now - 4 * DAY });

    db.cases.push(
      { id: next("case", "case"), topic: "delivery", name: "Rahul Menon", email: "rahul.menon@example.com", orderId: db.orders[3]?.id || "", message: "My tracking link has not updated for two days. Can you check?", status: "Open", owner: "", replies: [], createdAt: now - 1 * DAY },
      { id: next("case", "case"), topic: "product", name: "Kavya Reddy", email: "kavya.reddy@example.com", orderId: "", message: "Is the casserole suitable for induction hobs?", status: "Resolved", owner: "Priya Nair", replies: [{ by: "Priya Nair", at: now - 4 * DAY, text: "Yes, it works on gas, electric and induction hobs." }], createdAt: now - 5 * DAY },
      { id: next("case", "case"), topic: "suggestion", name: "Tara Fernandes", email: "tara.fernandes@example.com", orderId: "", message: "Would love to see more pet products for cats.", status: "In Progress", owner: "Rohan Das", replies: [], createdAt: now - 3 * DAY },
      { id: next("case", "case"), topic: "product", name: "Nikhil Gupta", email: "nikhil.gupta@example.com", orderId: "", message: "The candle tunnelled after the first burn.", status: "Open", owner: "", replies: [], createdAt: now - 6 * 3600000 }
    );

    db.audit.push(
      { id: next("audit", "aud"), at: now - 20 * DAY, userId: "adm-owner", userName: "Meera Iyer", role: "owner", event: "promotion.create", entity: "promotion", entityId: "promo-mug", before: null, after: { value: 15, mode: "percent" } },
      { id: next("audit", "aud"), at: now - 5 * DAY, userId: "adm-owner", userName: "Meera Iyer", role: "owner", event: "promotion.create", entity: "promotion", entityId: "promo-festive", before: null, after: { value: 20, mode: "percent" } },
      { id: next("audit", "aud"), at: now - 4 * DAY, userId: "adm-inv", userName: "Sana Khan", role: "inventory", event: "stock.adjust", entity: "inventory", entityId: "NRH-KIT-004", before: { onHand: 0 }, after: { onHand: 0 } },
      { id: next("audit", "aud"), at: now - 2 * DAY, userId: "adm-cat", userName: "Rohan Das", role: "catalogue", event: "product.submit", entity: "product", entityId: "p-pendant", before: { status: "draft" }, after: { status: "pending" } }
    );

    db.orders.sort((a, b) => a.createdAt - b.createdAt);
    return db;
  };
})();
