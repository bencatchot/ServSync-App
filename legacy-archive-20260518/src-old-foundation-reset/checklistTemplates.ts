import { Customer } from './types';

export const DOCX_CHECKLIST_TEMPLATES = {
  "Roof & Attic": [
    "Check roof shingles for missing, cracked, or curled pieces",
    "Inspect roof valleys for proper alignment and debris accumulation",
    "Look for algae, moss, or lichen growth (especially on north-facing slopes)",
    "Check flashing around chimneys, vents, and skylights for gaps or damage",
    "Inspect gutters and downspouts for debris, damage, and proper drainage",
    "Examine seals and caulking around roof penetrations",
    "Check attic for water stains, leaks, or moisture damage",
    "Verify attic ventilation is not blocked; inspect soffit vents",
    "Check for signs of pest infestation in attic (droppings, nesting)",
    "Inspect attic insulation for settling, damage, or moisture",
    "Check rafters and roof decking for sagging or structural issues",
    "Verify attic access door/hatch seals properly and has weatherstripping",
    "Inspect ductwork for leaks, disconnections, or deterioration",
    "Check for proper ventilation of bathroom and kitchen exhaust fans to exterior"
  ],
  "Foundation & Exterior Walls": [
    "Walk foundation perimeter checking for cracks, particularly diagonal cracks",
    "Look for horizontal cracks in foundation which may indicate pressure issues",
    "Check for step cracks in brick or block which may indicate settling",
    "Inspect mortar joints in brick/stone for deterioration or missing mortar",
    "Check for water damage, staining, or efflorescence (white salt deposits)",
    "Inspect siding (vinyl, wood, brick, fiber cement) for damage, rot, or deterioration",
    "Check for gaps or separations between siding and foundation",
    "Inspect wood siding for rot, soft spots, or insect damage (probe with knife)",
    "Check caulking and sealants around windows, doors, and siding joints",
    "Look for exterior paint peeling or failure indicating moisture intrusion",
    "Check basement/crawlspace walls for water intrusion or dampness",
    "Inspect window frames and door frames for rot, soft spots, or decay",
    "Check exterior penetrations (utilities, cables, pipes) for proper sealing",
    "Verify drainage slopes away from foundation (minimum 6 inches over 10 feet)",
    "Check for debris buildup against foundation or blocking drainage"
  ],
  "Landscaping & Drainage": [
    "Check grading around foundation for proper slope away from house",
    "Inspect downspout extensions to ensure water discharges 4-6+ feet from foundation",
    "Check gutters for debris, blockage, and proper pitch toward downspouts",
    "Look for standing water or pooling around foundation or in yard",
    "Inspect surface drainage in driveway, walkways, and patios",
    "Check for erosion or soil settlement near foundation",
    "Verify shrubs and trees are not planted too close to foundation (potential moisture)",
    "Check for tree branches overhanging roof (risk of damage and debris)",
    "Inspect grade-level deck connections for water intrusion under structure",
    "Check basement/crawlspace for water seepage or dampness after rainfall",
    "Verify sump pump (if present) is functioning and discharges properly",
    "Check French drains or other subsurface drainage systems for blockage"
  ],
  "Front Entry / Main Door": [
    "Check door frame for rot, warping, or separation from wall",
    "Inspect door for damage, warping, weathering, or proper operation",
    "Check threshold for proper height and no tripping hazards",
    "Verify weatherstripping around door frame is intact and not deteriorated",
    "Check door seals and gaskets for compression and gaps",
    "Inspect caulking around door frame and side lights",
    "Test door closure and sealing (light test: shine flashlight to detect gaps)",
    "Check door lock and hardware for proper function",
    "Verify door swing clearance and no binding",
    "Inspect concrete or stone at entry for cracks, heaving, or settling",
    "Check for proper drainage at entry (no water pooling)",
    "Verify entry light fixtures function properly and are properly sealed",
    "Check mailbox (if present) for damage and proper installation"
  ],
  "Garage Door": [
    "Inspect door panels for damage, dents, or deterioration",
    "Check door frame for warping, rot, or damage",
    "Test door balance by opening halfway and checking if it stays in place",
    "Inspect springs and cables for damage, wear, or rust (do NOT attempt to adjust)",
    "Check door weatherstripping and seals for gaps or damage",
    "Test door opener for proper operation and safety features",
    "Check auto-reverse safety feature (place object under door, should reverse)",
    "Inspect garage floor for cracks, heaving, or water damage",
    "Check garage walls for moisture damage, mold, or pest activity",
    "Verify door hardware and hinges are secure and functional",
    "Check for proper clearance and no obstructions in door travel",
    "Inspect caulking around garage frame and wall penetrations"
  ],
  "Secondary Doors (Side, Back, Basement)": [
    "Inspect each door frame for rot, warping, or structural issues",
    "Check door condition, glass integrity, and lock function",
    "Verify weatherstripping and seals are intact",
    "Inspect caulking around frames and thresholds",
    "Check sliding door tracks for debris and smooth operation",
    "Test locks and handles for proper function and security",
    "Verify doors open/close without binding or sticking",
    "Check for water stains or moisture damage around doorways",
    "Inspect threshold height and condition (no tripping hazards)",
    "Check drainage around exterior doors (proper slope away)"
  ],
  "Windows": [
    "Check window frames for rot, decay, soft spots, or paint failure",
    "Inspect caulking and sealants around frames for gaps or deterioration",
    "Test window operation: opening, closing, locking, and smooth movement",
    "Check for broken, cracked, or missing glass",
    "Inspect for condensation between panes (indicates seal failure in double-pane windows)",
    "Check weatherstripping and seals for compression and gaps",
    "Verify locking mechanisms function properly on all windows",
    "Inspect window sills for water damage, rot, or deterioration",
    "Check for water stains or moisture damage inside window frames",
    "Examine glazing compound (putty) for hardness and cracks (single-pane windows)",
    "Check screen condition (if applicable): tears, bent frames, missing screens",
    "Verify proper drainage at bottom of window sills",
    "Check for mold, mildew, or algae growth in frame or sill areas",
    "Inspect exterior trim and flashing around windows for damage",
    "Check operation of awning or casement windows for smooth movement"
  ],
  "Kitchen": [
    "Check refrigerator operation, temperature consistency, and drainage",
    "Verify water line connections are secure with no leaks",
    "Check oven/range functionality and gas connections (if applicable)",
    "Verify stovetop burners ignite and function properly",
    "Check oven door seal and hinge condition",
    "Inspect dishwasher door seal, spray arms, and operation",
    "Check for water leaks under or around dishwasher",
    "Verify garbage disposal operation and check for leaks at connection",
    "Inspect microwave operation and door seal",
    "Check for visible rust or deterioration on any appliances",
    "Check all visible water supply lines for leaks or damage",
    "Inspect under-sink cabinets for water damage, staining, or leaks",
    "Check drain and waste connections for corrosion or leaks",
    "Test faucet operation, water pressure, and spray function",
    "Check for proper slope in waste lines (toward drain)",
    "Verify shut-off valves are accessible and function properly",
    "Look for standing water, wet spots, or water stains around sink",
    "Check caulking around sink edges and backsplash",
    "Inspect exposed pipes for corrosion, mineral buildup, or damage",
    "Check cabinet doors for proper alignment and closing",
    "Inspect cabinet hinges and hardware for damage or looseness",
    "Check inside cabinets for evidence of water damage or pest activity",
    "Inspect countertop for damage, chips, or deterioration",
    "Check caulking/grout between countertop and wall",
    "Inspect backsplash for loose tiles, grout failure, or water damage",
    "Check cabinet bases for rot or water damage (especially under sink)",
    "Verify cabinet drawers operate smoothly and don't bind",
    "Check range hood or ventilation fan operation",
    "Verify exhaust ductwork is connected and not leaking",
    "Check for debris or grease buildup in hood or ducts",
    "Verify exhaust discharges outside (not into attic or crawlspace)",
    "Test window venting if present",
    "Check damper operation (if applicable)",
    "Check ceiling for water stains, discoloration, or sagging",
    "Inspect walls for water damage, staining, or mold",
    "Check floor condition for damage, rot, or unevenness",
    "Verify grout lines in tile floor are intact (if applicable)",
    "Check for adequate lighting and no loose electrical fixtures"
  ],
  "Bathrooms": [
    "Test sink faucet operation, water pressure, and drainage",
    "Check for water leaks under sink and at shut-off valve",
    "Inspect cabinet under sink for water damage or pest activity",
    "Test toilet flushing and tank refill",
    "Check for water leaks at toilet base or supply line",
    "Inspect toilet bowl and tank for cracks or damage",
    "Verify toilet seat is secure and not cracked",
    "Test bathtub/shower faucet and spray function",
    "Check shower door seals and hinges (if applicable)",
    "Test shower pan or tub for proper drainage",
    "Check for water stains or evidence of leaks around tub/shower",
    "Inspect caulking around tub, shower, and sink edges",
    "Check toilet water supply line for corrosion or leaks",
    "Inspect walls for water damage, staining, or soft spots",
    "Check tile grout for cracking, deterioration, or missing grout",
    "Inspect tile for cracks, chips, or loose tiles (tap to check)",
    "Check paint or wallpaper for peeling, bubbling, or water damage",
    "Inspect ceiling for water stains, sagging, or damage",
    "Check for mold or mildew growth (especially around tub/shower)",
    "Verify caulking around tub/shower enclosure is intact",
    "Check walls adjacent to water fixtures for moisture (probe if necessary)",
    "Test exhaust fan operation for proper airflow",
    "Check exhaust ductwork is connected and not blocked",
    "Verify exhaust discharges outside (not into attic or crawlspace)",
    "Look for moisture condensation or humidity accumulation",
    "Check ductwork for visible damage or disconnection",
    "Check floor for water damage, rot, or deterioration",
    "Inspect toilet flange and connection to waste line",
    "Check for proper slope in waste lines",
    "Verify shut-off valves are accessible",
    "Check for adequate lighting and no loose electrical fixtures",
    "Inspect door condition and seal"
  ],
  "Bedrooms & Living Spaces": [
    "Check ceiling for water stains, discoloration, or sagging",
    "Inspect walls for water damage, staining, mold, or pest activity",
    "Check floor condition for damage, rot, warping, or unevenness",
    "Inspect hardwood or laminate for cupping, buckling, or gaps",
    "Check carpet for stains, odors, or moisture damage",
    "Verify baseboards are secure and not rotted or soft",
    "Check door operation and condition",
    "Inspect window condition and operation",
    "Check window sills and frames for water damage",
    "Verify adequate outlets and no evidence of electrical issues",
    "Check light fixtures for proper operation",
    "Inspect closets for moisture, mold, or pest activity",
    "Check attic access areas for proper sealing and weatherstripping"
  ],
  "Laundry Room": [
    "Check washer/dryer operation (note age and condition)",
    "Inspect water supply lines for leaks or damage",
    "Check for proper drainage (washer drain should be elevated properly)",
    "Verify washer shut-off valves are accessible and functional",
    "Check dryer exhaust ductwork for blockage or disconnection",
    "Verify dryer exhaust discharges outside properly",
    "Inspect floor for water damage or deterioration",
    "Check walls for water damage, staining, or moisture",
    "Verify adequate ventilation in laundry room",
    "Check for proper slope in wash tub drain (if applicable)",
    "Inspect walls and ceiling for mold or mildew",
    "Check under washer/dryer for water damage or leaks"
  ],
  "Basement / Crawlspace": [
    "Check floor for moisture, water stains, or puddles",
    "Inspect walls for water intrusion, staining, or efflorescence",
    "Look for signs of past water damage (tide lines, staining)",
    "Check for mold or mildew growth on walls, floor, or items stored",
    "Verify sump pump (if present) operation and drainage",
    "Check sump pit for proper liquid level and debris",
    "Inspect foundation walls for cracks, particularly vertical cracks",
    "Check window wells (if applicable) for proper drainage and debris",
    "Verify basement windows have proper seals",
    "Inspect perimeter drainage system (French drain, etc.) for blockage",
    "Check dehumidifier operation (if present)",
    "Look for evidence of pest activity or entry points",
    "Verify proper ventilation and air circulation",
    "Check for standing water or dampness after rainfall",
    "Inspect visible plumbing, electrical, and mechanical systems",
    "Check storage items for water damage or pest damage",
    "Check moisture and condensation (place foil on floor, check for moisture under foil)",
    "Verify moisture barrier/vapor barrier is intact and properly installed",
    "Inspect for standing water or water seepage",
    "Check for proper drainage around perimeter",
    "Verify adequate ventilation or assess sealed crawlspace design",
    "Check insulation condition and for moisture damage",
    "Inspect visible plumbing for leaks or corrosion",
    "Check HVAC ducts for disconnection or damage",
    "Verify sump pump operation (if present)",
    "Look for pest activity, nesting, or entry points"
  ],
  "HVAC": [
    "Check thermostat operation and accuracy (temperature reading)",
    "Test heating system operation (if season-appropriate)",
    "Test cooling system operation (if season-appropriate)",
    "Check air filter condition and note replacement date",
    "Inspect furnace/air handler for visible damage or corrosion",
    "Check ductwork visible in attic/basement for leaks or disconnection",
    "Verify proper airflow from all supply vents",
    "Check return air vents are not blocked",
    "Inspect AC condenser unit exterior condition and debris",
    "Verify AC condenser is level and not sinking",
    "Check refrigerant line insulation for damage",
    "Inspect for visible rust or deterioration on HVAC equipment",
    "Check furnace/air handler clearances (combustible items kept away)",
    "Verify drain line from AC/furnace is clear and draining properly",
    "Check for proper gas line connections and odor detection",
    "Inspect thermostat batteries and connections"
  ],
  "Water Heater": [
    "Check water heater for proper operation and temperature",
    "Inspect for leaks at tank, connections, or relief valve",
    "Check relief valve for proper operation (do not discharge)",
    "Verify hot water supply at fixture (check temperature)",
    "Inspect exhaust vent for proper connection and clearance",
    "Check gas or electrical connections (as applicable)",
    "Verify drain valve is accessible and functional",
    "Inspect for rust, corrosion, or deterioration",
    "Check temperature and pressure relief valve for seepage",
    "Verify water heater is properly supported and secured",
    "Check anode rod condition (if accessible)",
    "Verify area around heater is clear of combustibles (if gas)",
    "Note age of water heater from label",
    "Check for adequate ventilation around water heater"
  ],
  "Plumbing Main": [
    "Check main water shut-off valve location and accessibility",
    "Test main shut-off valve operation (slow turn, don't force)",
    "Verify main water meter (if accessible) is functional and readable",
    "Inspect main water line for leaks or corrosion",
    "Check visible plumbing pipes for corrosion, deterioration, or leaks",
    "Identify pipe material (copper, PEX, PVC, galvanized, etc.)",
    "Look for water stains or evidence of past leaks",
    "Check drain-waste-vent system for proper slope",
    "Verify water pressure at multiple fixtures (normal 40-60 PSI)",
    "Inspect for slow drains or recurring clogs",
    "Check for proper venting (no siphoning sounds when draining)",
    "Verify ground clamps or supports on visible plumbing"
  ],
  "Electrical Panel": [
    "Inspect electrical panel for corrosion or water damage",
    "Check for proper labeling of circuits (note illegible or missing labels)",
    "Look for signs of overheating (discoloration, burn marks)",
    "Verify no double-tapped breakers (except where designed)",
    "Check for ground and neutral bonding",
    "Verify no open breaker slots or improper fill",
    "Inspect service entrance for proper grounding",
    "Check for proper breaker spacing and organization",
    "Note if panel is full and capacity concerns",
    "Verify panel is accessible and no storage items blocking",
    "Inspect panel box for gaps or loose covers"
  ],
  "Electrical Systems": [
    "Test light switches for proper operation (all switches in each room)",
    "Check light fixtures for operation and secure mounting",
    "Inspect electrical outlets for proper operation (test with outlet tester)",
    "Check for reverse polarity or missing ground (test outlets)",
    "Verify GFCI outlets in wet areas (kitchen, bathroom, exterior, garage)",
    "Test GFCI outlets for proper function (test/reset buttons)",
    "Inspect for loose or damaged outlet/switch covers",
    "Check for proper ground wires on two-prong outlets (where applicable)",
    "Inspect visible electrical wiring for damage or deterioration",
    "Look for extension cords being used permanently (safety issue)",
    "Check for overloaded outlets or power strips",
    "Verify adequate outlet spacing and no missing outlets",
    "Check for any burning smells or signs of electrical issues",
    "Inspect exterior outlets for proper GFCI protection",
    "Verify lighting in all areas including entry, stairs, etc."
  ],
  "Pest & Wildlife Control": [
    "Look for rodent droppings in attic, basement, kitchen, and cabinets",
    "Check for rodent entry points (gaps around pipes, foundation cracks)",
    "Inspect for rodent nesting material or damage",
    "Look for insect damage (termites, carpenter ants, carpenter bees)",
    "Check wood framing in attic and basement for insect galleries",
    "Inspect for termite mud tubes on foundation or framing",
    "Look for chewed wood, soft spots, or hollow-sounding wood",
    "Check for pest droppings or evidence of pest activity",
    "Inspect for ant nests or carpenter ant galleries",
    "Verify screens and seals are intact (no gaps for pests)",
    "Check soffit vents for pest screens and integrity",
    "Look for bird nests in vents, eaves, or chimneys",
    "Verify chimney cap is in place to prevent wildlife entry",
    "Check for evidence of bats (guano, staining, odor)",
    "Inspect for evidence of water-loving pests (requires moisture investigation)",
    "Check exterior for burrows or entry points"
  ],
  "Structural Components": [
    "Check floors for sagging, bouncing, or excessive movement (walk slowly)",
    "Inspect for sloping floors (use level or visual assessment)",
    "Check for cracking, separation, or gaps in walls (especially at corners)",
    "Inspect for structural cracks in foundation (vs. settling cracks)",
    "Check for evidence of foundation settling (doors/windows binding)",
    "Inspect door frames for squareness (check diagonal measurements)",
    "Check window frames for squareness and proper operation",
    "Verify proper beam and joist support (no sagging or deflection)",
    "Check for adequate foundation ventilation (not sealed where vented)",
    "Inspect visible structural wood for rot, insect damage, or deterioration",
    "Check for proper support piers under deck or porch (if applicable)",
    "Verify piers or supports are not sinking or settling unevenly",
    "Inspect for proper bracing and connection details",
    "Check load-bearing walls for proper support and no cutting/modification",
    "Verify no major structural modifications without proper support added"
  ],
  "Decks & Patios": [
    "Inspect deck framing for rot, soft spots, or deterioration (probe with knife)",
    "Check deck stairs for loose steps or damaged treads",
    "Verify deck railing height, spacing, and security (40-inch height minimum)",
    "Inspect railing balusters for proper spacing (4-inch sphere rule)",
    "Check for loose railing boards or fasteners",
    "Inspect deck boards for rot, cupping, or deterioration",
    "Check for proper drainage under deck (no water pooling)",
    "Verify deck support posts are not sinking or settling",
    "Check ledger board connection to house (common failure point)",
    "Verify flashing where deck attaches to house",
    "Inspect for proper water drainage away from deck",
    "Check concrete pad/patio for cracks, heaving, or settling",
    "Verify proper slope for drainage (away from house)",
    "Check for deterioration, staining, or efflorescence on concrete"
  ]
} as const;

export type ChecklistTemplateName = keyof typeof DOCX_CHECKLIST_TEMPLATES;

export function homeAge(customer?: Customer | null) {
  const year = Number(String(customer?.home.yearBuilt || '').match(/\d{4}/)?.[0] || 0);
  if (!year) return null;
  return new Date().getFullYear() - year;
}

export function templateNamesForRoom(room: string): ChecklistTemplateName[] {
  const r = room.toLowerCase();
  if (r.includes('kitchen')) return ['Kitchen', 'Electrical Systems'];
  if (r.includes('bath') || r.includes('powder')) return ['Bathrooms', 'Electrical Systems'];
  if (r.includes('laundry')) return ['Laundry Room', 'Electrical Systems'];
  if (r.includes('garage')) return ['Garage Door', 'Electrical Panel', 'Electrical Systems'];
  if (r.includes('attic')) return ['Roof & Attic', 'Pest & Wildlife Control'];
  if (r.includes('basement') || r.includes('crawl')) return ['Basement / Crawlspace', 'Foundation & Exterior Walls', 'Pest & Wildlife Control'];
  if (r.includes('hvac') || r.includes('mechanical') || r.includes('utility')) return ['HVAC', 'Water Heater', 'Plumbing Main', 'Electrical Panel'];
  if (r.includes('water heater')) return ['Water Heater', 'Plumbing Main'];
  if (r.includes('electrical') || r.includes('panel')) return ['Electrical Panel', 'Electrical Systems'];
  if (r.includes('deck') || r.includes('patio') || r.includes('porch')) return ['Decks & Patios'];
  if (r.includes('exterior') || r.includes('yard') || r.includes('landscape')) return ['Roof & Attic', 'Foundation & Exterior Walls', 'Landscaping & Drainage', 'Front Entry / Main Door', 'Secondary Doors (Side, Back, Basement)', 'Windows', 'Decks & Patios', 'Pest & Wildlife Control', 'Structural Components'];
  return ['Bedrooms & Living Spaces', 'Windows', 'Electrical Systems'];
}

export function ageBasedItems(customer?: Customer | null): string[] {
  const age = homeAge(customer);
  if (!age) return [];
  const items: string[] = [];
  if (age >= 20) {
    items.push('Age-based: check original plumbing fixtures/supply lines for corrosion or deterioration');
    items.push('Age-based: inspect caulking/sealants at openings and wet areas for failure');
  }
  if (age >= 30) {
    items.push('Age-based: verify electrical panel capacity, labeling, and signs of overheating');
    items.push('Age-based: check windows/doors for settlement, binding, or failed seals');
  }
  if (age >= 50) {
    items.push('Age-based: identify older pipe material and monitor galvanized/cast iron drain lines');
    items.push('Age-based: check for older wiring concerns, missing grounds, or obsolete devices');
    items.push('Age-based: inspect structural settlement indicators around floors, walls, doors, and windows');
  }
  return items;
}

const CURATED_ROOM_CHECKLISTS: Record<string, string[]> = {
  kitchen: [
    'Sink faucet and sprayer for leaks or low pressure',
    'Under-sink pipes and garbage disposal for drips',
    'Refrigerator coils, door seals, and water line',
    'Range hood filter and fan',
    'Dishwasher filter, seal, and drain area',
    'GFCI outlets',
    'Fire extinguisher pressure gauge and accessibility',
  ],
  bathroom: [
    'Toilets for running water, loose base, or leaks',
    'Sink and tub drains for slow drainage',
    'Faucets, showerheads, and valves for leaks',
    'Caulk and grout around tub, shower, and sink',
    'Exhaust fan operation',
    'GFCI outlets',
    'Signs of moisture, mildew, or soft flooring',
  ],
  bedroom: [
    'Windows, locks, and screens',
    'Ceiling fan or light fixtures',
    'HVAC vents for airflow and dust buildup',
    'Smoke detector operation',
    'Closet doors, shelves, and rods',
    'Signs of pests, moisture, or wall damage',
  ],
  living: [
    'Smoke and carbon monoxide detectors',
    'Fireplace, damper, hearth, and screen if applicable',
    'Electrical outlets and extension cords',
    'Windows and door locks',
    'Ceiling fans and light fixtures',
    'HVAC vents and return grilles',
    'Signs of wall, ceiling, or floor damage',
  ],
  laundry: [
    'Washer hoses for bulges, cracks, or leaks',
    'Dryer lint trap and vent airflow',
    'Utility sink and drain if present',
    'Floor drain if present',
    'Water shutoff valves',
    'Electrical outlet and GFCI protection',
    'Signs of moisture behind appliances',
  ],
  garage: [
    'Garage door opener, tracks, rollers, and safety sensors',
    'Door weatherstripping',
    'Exterior door locks and seals',
    'Stored chemicals, paint, and fuel containers',
    'Water heater if located there',
    'Electrical outlets and GFCI protection',
    'Signs of pests or water intrusion',
  ],
  basement: [
    'Foundation walls for cracks or moisture',
    'Sump pump operation',
    'Dehumidifier and drain line',
    'Exposed plumbing for leaks',
    'HVAC equipment area',
    'Insulation and vapor barrier condition',
    'Signs of pests, mold, or standing water',
  ],
  attic: [
    'Roof leaks or water stains',
    'Ventilation openings',
    'Insulation condition',
    'Signs of pests',
    'Bathroom or kitchen exhaust ducts',
    'Recessed light areas for heat or staining',
    'Structural framing for visible damage',
  ],
  hallway: [
    'Door locks, hinges, and weatherstripping',
    'Stair railings and handrails',
    'Smoke and carbon monoxide detectors',
    'Light switches and fixtures',
    'Flooring transitions or loose treads',
    'HVAC vents',
    'Signs of wall or ceiling cracks',
  ],
  exterior: [
    'Gutters and downspouts',
    'Roof shingles visible from the ground',
    'Siding, trim, and exterior caulk',
    'Hose bibs and outdoor faucets',
    'Decks, railings, and stairs',
    'Walkways and driveway cracks',
    'Exterior lights and outlets',
    'Drainage around the foundation',
  ],
  wholeHouse: [
    'HVAC filter',
    'Thermostat operation',
    'Water heater leaks, rust, and temperature setting',
    'Main water shutoff accessibility',
    'Electrical panel for clear access and unusual heat/noise',
    'Smoke detectors',
    'Carbon monoxide detectors',
    'Security system or cameras',
    'Pest activity signs',
  ],
};

function curatedKeyForRoom(room: string) {
  const r = room.toLowerCase();
  if (r.includes('kitchen')) return 'kitchen';
  if (r.includes('bath') || r.includes('powder')) return 'bathroom';
  if (r.includes('laundry')) return 'laundry';
  if (r.includes('garage')) return 'garage';
  if (r.includes('attic')) return 'attic';
  if (r.includes('basement') || r.includes('crawl')) return 'basement';
  if (r.includes('whole') || r.includes('system') || r.includes('hvac') || r.includes('mechanical') || r.includes('utility') || r.includes('water heater') || r.includes('electrical') || r.includes('panel')) return 'wholeHouse';
  if (r.includes('deck') || r.includes('patio') || r.includes('porch') || r.includes('exterior') || r.includes('yard') || r.includes('landscape')) return 'exterior';
  if (r.includes('hall') || r.includes('entry') || r.includes('stair') || r.includes('foyer')) return 'hallway';
  if (r.includes('living') || r.includes('family') || r.includes('dining') || r.includes('office') || r.includes('sunroom')) return 'living';
  return 'bedroom';
}

function topAgeBasedItem(customer?: Customer | null) {
  const age = homeAge(customer);
  if (!age || age < 20) return null;
  if (age >= 50) return 'Age-based: check for older wiring concerns, missing grounds, or obsolete devices';
  if (age >= 30) return 'Age-based: check windows/doors for settlement, binding, or failed seals';
  return 'Age-based: inspect caulking/sealants at openings and wet areas for failure';
}

export function checklistSectionsForRoom(room: string, _customer?: Customer | null): Record<string, string[]> {
  const key = curatedKeyForRoom(room);
  const items = CURATED_ROOM_CHECKLISTS[key] || CURATED_ROOM_CHECKLISTS.bedroom;
  return { 'Recommended Defaults': Array.from(new Set(items)) };
}

export function recommendedItemsForRoom(room: string, customer?: Customer | null): string[] {
  return checklistSectionsForRoom(room, customer)['Recommended Defaults'] || [];
}

export const ALL_TEMPLATE_ITEMS = Array.from(new Set([
  ...Object.values(DOCX_CHECKLIST_TEMPLATES).flat(),
  ...Object.values(CURATED_ROOM_CHECKLISTS).flat(),
  ...ageBasedItems({ home: { yearBuilt: '1900' } } as Customer),
])).sort((a, b) => a.localeCompare(b));
