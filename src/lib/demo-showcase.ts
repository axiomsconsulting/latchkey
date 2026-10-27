/**
 * The four regional demo properties, one on each concept theme, beside The
 * Hill Suites on the shared demo account: Texas (Desert Star), Mayfair
 * (Palace Heritage), Paris (Grand Crimson) and Tokyo (Express Green). Every
 * name, address, business and phone number is invented (phone numbers use the
 * ranges set aside for fiction where a country has one). Each has its own
 * guest link and host link with its own campaign name (/tour/<key>,
 * /demo/host/<key>). Rebuilt daily with the tour by the one demo routine
 * (refreshDemoProperties in demo.functions.ts). Pure data.
 */
import type { BreakfastInfo, ExtraUnit } from "./extras";
import type { DemoBooking, DemoRoom } from "./demo-data";

export type ShowcaseKey = "texas" | "mayfair" | "paris" | "tokyo";

export type ShowcaseExtra = {
  key: string;
  name: string;
  description?: string;
  /** Hundredths of the currency's main unit (yen too: 180000 = ¥1,800). */
  pricePence: number;
  unit: ExtraUnit;
  maxQty: number;
  isFree?: boolean;
  autoApprove?: boolean;
  isLoan?: boolean;
  breakfast?: BreakfastInfo;
};

export type ShowcaseTrade = {
  name: string;
  company_name: string;
  category: string;
  phone: string;
  area: string;
  notes: string;
  rating: number;
  is_preferred?: boolean;
};

export type ShowcaseSpec = {
  key: ShowcaseKey;
  /** Where it is, for links and the demo page. */
  label: string;
  themeName: string;
  short_code: string;
  campaign: { guest: string; host: string };
  property: {
    name: string;
    address: string;
    postcode: string;
    country_code: string;
    timezone: string;
    currency: string;
    wifi_name: string;
    wifi_password: string;
    parking_notes: string;
    host_contact_name: string;
    host_contact_phone: string;
    default_check_in_time: string;
    default_check_out_time: string;
    quiet_hours_start: string;
    quiet_hours_end: string;
  };
  theme: Record<string, unknown>;
  rooms: DemoRoom[];
  guests: string[];
  channels: DemoBooking["channel"][];
  checkIn: string;
  checkOut: string;
  lateArrival: string;
  trades: ShowcaseTrade[];
  extras: ShowcaseExtra[];
  guides: Array<{ section_key: string; summary: string }>;
  request: { category: string; title: string; note: string };
  maintenance: { roomKey: string; category: string; title: string; note: string };
  conversation: { ask: string; reply: string; waiting: string };
};

const room = (
  key: string,
  n: number,
  display_name: string,
  public_title: string,
  description: string,
  max_guests: number,
  has_ensuite: boolean,
): DemoRoom => ({
  key,
  room_number: String(n),
  display_name,
  public_title,
  description,
  max_guests,
  has_ensuite,
  sort_order: n,
});

const late = (pricePence: number): ShowcaseExtra => ({
  key: "late_checkout",
  name: "Late check-out",
  pricePence,
  unit: "hour",
  maxQty: 2,
  autoApprove: true,
});
const early = (pricePence: number): ShowcaseExtra => ({
  key: "early_checkin",
  name: "Early check-in",
  pricePence,
  unit: "hour",
  maxQty: 3,
});

export const SHOWCASE: ShowcaseSpec[] = [
  {
    key: "texas",
    label: "Texas",
    themeName: "Desert Star",
    short_code: "desert-star-texas",
    campaign: { guest: "demo-texas-guest", host: "demo-texas-host" },
    property: {
      name: "Desert Star Motor Lodge",
      address: "1205 Mesquite Trail, Marfa, Texas",
      postcode: "TX 79843",
      country_code: "US",
      timezone: "America/Chicago",
      currency: "USD",
      wifi_name: "DesertStar-Guest",
      wifi_password: "bigsky1205",
      parking_notes:
        "Park right outside your casita. Pick-ups and trailers welcome on the gravel lot.",
      host_contact_name: "Dolores Martínez",
      host_contact_phone: "+14325550142",
      default_check_in_time: "15:00",
      default_check_out_time: "11:00",
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    },
    theme: {
      presetId: "desert-star",
      // The logo from the concept mockups for this template.
      logoPreset: "sunburst",
      subname: "Marfa, Texas",
      eyebrow: "Howdy",
      welcomeTitle: "Your stay at {property}",
      welcomeBody: "Check yourself in, then everything you need for the desert is in your guide.",
      tagline: "Big sky, quiet nights",
      features: [
        { icon: "star", text: "Dark-sky stargazing" },
        { icon: "car", text: "Parking by your door" },
        { icon: "coffee", text: "Breakfast tacos to order" },
      ],
    },
    rooms: [
      room(
        "r1",
        1,
        "Ocotillo Casita",
        "Ocotillo Casita · king bed",
        "Adobe casita with a king bed, a porch swing and a view of the Davis Mountains.",
        2,
        true,
      ),
      room(
        "r2",
        2,
        "Mesa Room",
        "Mesa Room · queen and daybed",
        "Queen bed and a daybed, Saltillo tile floors and a walk-in shower.",
        3,
        true,
      ),
      room(
        "r3",
        3,
        "Stargazer Bunk",
        "Stargazer Bunk · twin",
        "A snug twin under a skylight, for travellers on the road.",
        2,
        false,
      ),
    ],
    guests: [
      "Hank Whitaker",
      "Rosa Delgado",
      "Lily Chen",
      "Marcus Boone",
      "Jenna Ortiz",
      "Wade Coleman",
      "Ava Nguyen",
      "Diego Salinas",
      "Brooke Tanner",
      "Eli Fischer",
      "Carmen Reyes",
      "Tyler Brooks",
    ],
    channels: ["airbnb", "vrbo", "direct", "booking_com", "airbnb", "direct"],
    checkIn: "15:00",
    checkOut: "11:00",
    lateArrival: "23:00",
    trades: [
      {
        name: "Ray Castillo",
        company_name: "Big Bend Plumbing Co.",
        category: "plumbing",
        phone: "+14325550178",
        area: "Marfa and Alpine",
        notes: "Knows the old cast-iron pipes. Call before 8am.",
        rating: 4.8,
        is_preferred: true,
      },
      {
        name: "Tasha Greene",
        company_name: "High Desert Cooling",
        category: "heating",
        phone: "+14325550191",
        area: "Presidio County",
        notes: "Swamp coolers and AC. Same-day in summer.",
        rating: 4.6,
      },
      {
        name: "Luis Ortega",
        company_name: "Mesquite Clean Team",
        category: "cleaning",
        phone: "+14325550133",
        area: "Marfa",
        notes: "Turnovers between 11 and 3.",
        rating: 4.9,
        is_preferred: true,
      },
    ],
    extras: [
      late(2500),
      early(2500),
      {
        key: "firewood",
        name: "Firewood bundle for the fire pit",
        pricePence: 1500,
        unit: "item",
        maxQty: 3,
        autoApprove: true,
      },
      {
        key: "cooler",
        name: "Cooler with ice",
        pricePence: 1000,
        unit: "item",
        maxQty: 2,
        autoApprove: true,
      },
      {
        key: "telescope",
        name: "Telescope for the night",
        pricePence: 0,
        unit: "item",
        maxQty: 1,
        isFree: true,
        isLoan: true,
        autoApprove: true,
      },
      {
        key: "bf_tacos_pack",
        name: "Breakfast tacos to go (two)",
        description: "Egg, potato and chorizo in flour tortillas, salsa verde on the side.",
        pricePence: 950,
        unit: "item",
        maxQty: 6,
        breakfast: { style: "packed" },
      },
      {
        key: "bf_kolache",
        name: "Kolache box",
        description: "Three kolaches: sausage, cream cheese and peach.",
        pricePence: 800,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "packed" },
      },
      {
        key: "bf_migas",
        name: "Migas plate",
        description: "Scrambled eggs with tortilla strips, peppers and queso fresco.",
        pricePence: 1400,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "delivered", section: "Hot" },
      },
      {
        key: "bf_biscuits",
        name: "Biscuits and gravy",
        description: "Buttermilk biscuits with sausage gravy.",
        pricePence: 1200,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "delivered", section: "Hot" },
      },
      {
        key: "bf_coffee_pot",
        name: "Pot of pecan coffee",
        description: "Serves two.",
        pricePence: 600,
        unit: "item",
        maxQty: 2,
        breakfast: { style: "delivered", section: "Drinks" },
      },
      {
        key: "bf_rancheros",
        name: "Huevos rancheros",
        description: "Fried eggs on corn tortillas, ranchero sauce, refried beans.",
        pricePence: 1500,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Hot" },
      },
      {
        key: "bf_pancakes",
        name: "Pecan pancakes",
        description: "Stack of three with maple butter.",
        pricePence: 1300,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Hot" },
      },
      {
        key: "bf_oj",
        name: "Fresh orange juice",
        pricePence: 500,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Drinks" },
      },
      {
        key: "bf_coffee",
        name: "Pecan coffee",
        pricePence: 400,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Drinks" },
      },
    ],
    guides: [
      {
        section_key: "getting_in",
        summary:
          "Your casita has its own door code, shown here from your arrival day. The office porch light stays on all night.",
      },
      {
        section_key: "parking",
        summary: "Park right outside your casita. The gravel lot takes pick-ups and trailers.",
      },
      {
        section_key: "taxis",
        summary:
          "There are no taxis in town after dark. Lone Star Rides (+1 432 555 0166) runs to Alpine and the El Paso airport if you book a day ahead.",
      },
      {
        section_key: "rules",
        summary:
          "No fireworks: the desert is dry. Fire pit only in the ring, and please put it out with the bucket by the door.",
      },
      {
        section_key: "checkout",
        summary:
          "Check-out is 11am. Leave the key card in the box by the office door and close the screen door behind you.",
      },
    ],
    request: {
      category: "linen",
      title: "Extra blankets",
      note: "It gets cold at night. Could we have two more blankets?",
    },
    maintenance: {
      roomKey: "r2",
      category: "heating",
      title: "Swamp cooler rattles",
      note: "Check the fan belt before the weekend guests.",
    },
    conversation: {
      ask: "Hi, where's the best place to see the Marfa lights tonight?",
      reply:
        "The viewing area is about 9 miles east on Highway 90. Head out around sunset and take a jacket: it's in your guide too.",
      waiting: "We'll be in late, around 11pm. Is the office open?",
    },
  },
  {
    key: "mayfair",
    label: "Mayfair, London",
    themeName: "Palace Heritage",
    short_code: "ashcombe-mayfair",
    campaign: { guest: "demo-mayfair-guest", host: "demo-mayfair-host" },
    property: {
      name: "Ashcombe House",
      address: "7 Linden Mews, Mayfair, London",
      postcode: "W1K 9ZZ",
      country_code: "GB",
      timezone: "Europe/London",
      currency: "GBP",
      wifi_name: "Ashcombe-Guests",
      wifi_password: "lindenmews7",
      parking_notes:
        "No parking at the house. The nearest car park is two minutes' walk; ask us for a discounted day rate.",
      host_contact_name: "Charlotte Ashby",
      host_contact_phone: "+442079460123",
      default_check_in_time: "15:00",
      default_check_out_time: "11:00",
      quiet_hours_start: "22:30",
      quiet_hours_end: "07:30",
    },
    theme: {
      presetId: "palace-heritage",
      // The logo from the concept mockups for this template.
      logoPreset: "lantern",
      subname: "Mayfair",
      welcomeTitle: "Welcome, your stay awaits",
      welcomeBody: "Tap to begin your arrival",
      sideNotes: ["Mayfair · A town house since 1893", "London · Quietly at home"],
    },
    rooms: [
      room(
        "r1",
        1,
        "Linden Suite",
        "The Linden Suite · four-poster",
        "First-floor suite with a four-poster, a dressing room and a marble bathroom.",
        2,
        true,
      ),
      room(
        "r2",
        2,
        "Mews Room",
        "The Mews Room · king",
        "King bed overlooking the cobbled mews, with a deep bath.",
        2,
        true,
      ),
      room(
        "r3",
        3,
        "Library Room",
        "The Library Room · double",
        "Book-lined double with a writing desk and a rainfall shower.",
        2,
        true,
      ),
    ],
    guests: [
      "Oliver Pemberton",
      "Amara Okoye",
      "Sophie Lambert",
      "Rajesh Iyer",
      "Hugo Fairfax",
      "Isabella Rossi",
      "James Whitmore",
      "Fatima Al-Sayed",
      "Edward Langley",
      "Mei Tanaka",
      "Charlotte Brennan",
      "Samuel Adeyemi",
    ],
    channels: ["booking_com", "direct", "airbnb", "direct", "booking_com"],
    checkIn: "15:00",
    checkOut: "11:00",
    lateArrival: "22:30",
    trades: [
      {
        name: "Graham Pike",
        company_name: "Pike & Sons Plumbing",
        category: "plumbing",
        phone: "+442079460188",
        area: "Westminster and Kensington",
        notes: "Gas Safe registered. Knows the old boiler.",
        rating: 4.9,
        is_preferred: true,
      },
      {
        name: "Anita Kowalska",
        company_name: "Belgravia Linen Service",
        category: "linen",
        phone: "+442079460155",
        area: "Central London",
        notes: "Collects at 9, returns by 4.",
        rating: 4.7,
      },
      {
        name: "Marcus Hale",
        company_name: "Hale Electrical",
        category: "electrical",
        phone: "+442079460177",
        area: "Mayfair and Marylebone",
        notes: "NICEIC approved. Out-of-hours line.",
        rating: 4.8,
      },
    ],
    extras: [
      late(3000),
      early(3000),
      {
        key: "afternoon_tea",
        name: "Afternoon tea for two",
        description:
          "Sandwiches, scones with clotted cream, and a pot of Darjeeling, in the drawing room.",
        pricePence: 5800,
        unit: "item",
        maxQty: 2,
      },
      {
        key: "car_heathrow",
        name: "Car to Heathrow",
        description: "A driver meets you at the door.",
        pricePence: 8500,
        unit: "item",
        maxQty: 1,
      },
      { key: "flowers", name: "Flowers in the room", pricePence: 4500, unit: "item", maxQty: 1 },
      {
        key: "umbrella",
        name: "Umbrella",
        pricePence: 0,
        unit: "item",
        maxQty: 2,
        isFree: true,
        isLoan: true,
        autoApprove: true,
      },
      {
        key: "bf_roll",
        name: "Bacon roll and tea to go",
        description: "Back bacon in a soft white roll, with a takeaway tea.",
        pricePence: 900,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "packed" },
      },
      {
        key: "bf_tray",
        name: "Continental tray",
        description: "Croissant, toast, preserves, yoghurt, fruit, juice and coffee or tea.",
        pricePence: 2200,
        unit: "item",
        maxQty: 2,
        breakfast: { style: "delivered" },
      },
      {
        key: "bf_full_english",
        name: "Full English",
        description:
          "Eggs your way, back bacon, Cumberland sausage, mushrooms, tomato, black pudding and toast.",
        pricePence: 2400,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Hot" },
      },
      {
        key: "bf_royale",
        name: "Eggs Royale",
        description: "Poached eggs and smoked salmon on a toasted muffin, with hollandaise.",
        pricePence: 1900,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Hot" },
      },
      {
        key: "bf_kippers",
        name: "Grilled kippers",
        description: "With brown bread and butter.",
        pricePence: 1800,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Hot" },
      },
      {
        key: "bf_porridge",
        name: "Porridge with honey",
        pricePence: 1100,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Lighter" },
      },
      {
        key: "bf_tea",
        name: "English Breakfast tea",
        pricePence: 600,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Drinks" },
      },
      {
        key: "bf_flat_white",
        name: "Flat white",
        pricePence: 500,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Drinks" },
      },
    ],
    guides: [
      {
        section_key: "getting_in",
        summary:
          "Ring the brass bell at the black door, or use your door code from 3pm on your arrival day. The hall light comes on as you step in.",
      },
      {
        section_key: "parking",
        summary:
          "There's no parking at the house. The car park on the next street is two minutes' walk; ask us for a day rate.",
      },
      {
        section_key: "taxis",
        summary:
          "Black cabs pass the end of the mews all day. For an early airport run, ask us to book a car the evening before.",
      },
      {
        section_key: "rules",
        summary:
          "Please keep voices low on the stairs after 10:30pm: our neighbours are close. No smoking anywhere in the house.",
      },
      {
        section_key: "checkout",
        summary:
          "Check-out is 11am. Leave your key on the hall table; we're happy to keep your bags until the evening.",
      },
    ],
    request: {
      category: "linen",
      title: "Fresh robes",
      note: "Could we have fresh bathrobes this afternoon, please?",
    },
    maintenance: {
      roomKey: "r3",
      category: "electrical",
      title: "Reading lamp flickers",
      note: "Replace the bulb or the switch by the writing desk.",
    },
    conversation: {
      ask: "Good morning. Could you recommend somewhere for supper near the house?",
      reply:
        "Of course. There's a lovely bistro on the corner of the square, two minutes away. We can book you a table for eight.",
      waiting: "Our flight lands at 9pm. Is it all right to arrive around half past ten?",
    },
  },
  {
    key: "paris",
    label: "Paris",
    themeName: "Grand Crimson",
    short_code: "maison-vermeil-paris",
    campaign: { guest: "demo-paris-guest", host: "demo-paris-host" },
    property: {
      name: "Maison Vermeil",
      address: "21 rue des Lanternes, Le Marais, Paris",
      postcode: "75004",
      country_code: "FR",
      timezone: "Europe/Paris",
      currency: "EUR",
      wifi_name: "Vermeil-Invites",
      wifi_password: "lanternes21",
      parking_notes:
        "No parking at the house. The public car park two streets away is open day and night.",
      host_contact_name: "Camille Laurent",
      host_contact_phone: "+33199001234",
      default_check_in_time: "16:00",
      default_check_out_time: "11:00",
      quiet_hours_start: "22:00",
      quiet_hours_end: "08:00",
    },
    theme: {
      presetId: "grand-crimson",
      // The logo from the concept mockups for this template.
      logoPreset: "monogram",
      subname: "Le Marais, Paris",
      welcomeTitle: "Bienvenue à {property}",
      welcomeBody: "Check yourself in, find your room and ask for anything you need.",
    },
    rooms: [
      room(
        "r1",
        1,
        "Chambre Rubis",
        "Chambre Rubis · double",
        "Crimson velvet, a marble fireplace and a balcony over the rue des Lanternes.",
        2,
        true,
      ),
      room(
        "r2",
        2,
        "Suite Opéra",
        "Suite Opéra · king and sofa bed",
        "Our largest room, with a sitting area and a claw-foot bath.",
        3,
        true,
      ),
      room(
        "r3",
        3,
        "La Mansarde",
        "La Mansarde · double under the eaves",
        "A cosy room in the attic with views over the zinc rooftops.",
        2,
        true,
      ),
    ],
    guests: [
      "Léa Moreau",
      "Antoine Dubois",
      "Chloé Bernard",
      "Julien Fabre",
      "Sofia Esposito",
      "Mathis Girard",
      "Inès Haddad",
      "Thomas Müller",
      "Manon Lefèvre",
      "Kenji Watanabe",
      "Clara Weiss",
      "Hugo Martin",
    ],
    channels: ["airbnb", "booking_com", "direct", "airbnb", "booking_com"],
    checkIn: "16:00",
    checkOut: "11:00",
    lateArrival: "23:00",
    trades: [
      {
        name: "Pascal Girard",
        company_name: "Plomberie du Marais",
        category: "plumbing",
        phone: "+33199001256",
        area: "Paris 3e et 4e",
        notes: "Comes the same day before noon.",
        rating: 4.7,
        is_preferred: true,
      },
      {
        name: "Nadia Benali",
        company_name: "Lavande Ménage",
        category: "cleaning",
        phone: "+33199001278",
        area: "Paris centre",
        notes: "Turnovers 11h–16h, linen included.",
        rating: 4.9,
        is_preferred: true,
      },
      {
        name: "Olivier Roux",
        company_name: "Électricité Roux",
        category: "electrical",
        phone: "+33199001290",
        area: "Paris",
        notes: "Old wiring specialist.",
        rating: 4.6,
      },
    ],
    extras: [
      late(2500),
      early(2500),
      {
        key: "champagne",
        name: "Bottle of champagne on arrival",
        pricePence: 6500,
        unit: "item",
        maxQty: 2,
      },
      { key: "bouquet", name: "Bouquet of flowers", pricePence: 4500, unit: "item", maxQty: 1 },
      {
        key: "metro_pass",
        name: "Day pass for the Métro",
        description: "Bought for you and left in your room.",
        pricePence: 1200,
        unit: "item",
        maxQty: 4,
        autoApprove: true,
      },
      {
        key: "bf_sac",
        name: "Bakery bag",
        description: "Croissant, pain au chocolat and a clementine, to take with you.",
        pricePence: 700,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "packed" },
      },
      {
        key: "bf_plateau",
        name: "Viennoiserie tray",
        description: "Croissants, pains au chocolat, baguette, butter, jam and juice.",
        pricePence: 1600,
        unit: "item",
        maxQty: 2,
        breakfast: { style: "delivered" },
      },
      {
        key: "bf_cafe_room",
        name: "Café crème",
        pricePence: 450,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "delivered", section: "Drinks" },
      },
      {
        key: "bf_parisien",
        name: "Petit-déjeuner parisien",
        description: "Croissant, tartine with butter and jam, orange juice and a hot drink.",
        pricePence: 1800,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Formules" },
      },
      {
        key: "bf_omelette",
        name: "Omelette aux fines herbes",
        description: "With a green salad and toasted pain de campagne.",
        pricePence: 1400,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Chaud" },
      },
      {
        key: "bf_cafe",
        name: "Café crème",
        pricePence: 450,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Boissons" },
      },
      {
        key: "bf_chocolat",
        name: "Chocolat chaud",
        pricePence: 500,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Boissons" },
      },
    ],
    guides: [
      {
        section_key: "getting_in",
        summary:
          "Type your code at the street door (digicode), cross the courtyard, and the guest entrance is the blue door on the left.",
      },
      {
        section_key: "parking",
        summary:
          "There's no parking at the house. The public car park two streets away is open day and night.",
      },
      {
        section_key: "taxis",
        summary:
          "The nearest taxi rank is by the Métro station, four minutes' walk. For the airport, we can book a car the evening before.",
      },
      {
        section_key: "rules",
        summary:
          "Please keep the courtyard quiet after 10pm: the building is home to families. No smoking in the rooms; the courtyard is fine.",
      },
      {
        section_key: "checkout",
        summary:
          "Check-out is 11am. Leave your key in the box by the blue door; we can keep your bags until the evening.",
      },
    ],
    request: {
      category: "linen",
      title: "Extra pillows",
      note: "Could we have two more pillows, please?",
    },
    maintenance: {
      roomKey: "r1",
      category: "plumbing",
      title: "Basin drains slowly",
      note: "Clear the trap before the weekend.",
    },
    conversation: {
      ask: "Bonjour, is there a good boulangerie nearby for tomorrow morning?",
      reply:
        "Bonjour. The one on the corner of the rue des Lanternes opens at 7. Or order the bakery bag from your guide and we'll have it ready.",
      waiting: "Our train arrives at Gare de Lyon at 10:30pm. Can we still check in?",
    },
  },
  {
    key: "tokyo",
    label: "Tokyo",
    themeName: "Express Green",
    short_code: "aoba-tokyo",
    campaign: { guest: "demo-tokyo-guest", host: "demo-tokyo-host" },
    property: {
      name: "Aoba Express Kanda",
      address: "3-9-1 Midori-cho, Kanda, Chiyoda, Tokyo",
      postcode: "101-0000",
      country_code: "JP",
      timezone: "Asia/Tokyo",
      currency: "JPY",
      wifi_name: "Aoba-Guest",
      wifi_password: "kanda391",
      parking_notes:
        "No parking. Coin car parks are on the next street; Kanda Station is five minutes' walk.",
      host_contact_name: "Kenta Mori",
      host_contact_phone: "+819000000123",
      default_check_in_time: "15:00",
      default_check_out_time: "10:00",
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    },
    theme: {
      presetId: "express-green",
      // The logo from the concept mockups for this template.
      logoPreset: "key",
      subname: "Kanda, Tokyo",
      welcomeTitle: "Welcome. Let's get you checked in",
      welcomeBody: "Start with the first letter of your surname.",
      tagline: "Simple, bright, on time",
      features: [
        { icon: "map-pin", text: "Five minutes to Kanda Station" },
        { icon: "wifi", text: "Fast Wi-Fi in every room" },
        { icon: "coffee", text: "Japanese breakfast to order" },
      ],
    },
    rooms: [
      room(
        "r1",
        1,
        "Sakura Twin",
        "Sakura · twin room",
        "Two single beds, a desk and blackout blinds for jet lag.",
        2,
        true,
      ),
      room(
        "r2",
        2,
        "Ginkgo Double",
        "Ginkgo · double room",
        "A double bed, a view over the rooftops and a deep Japanese bath.",
        2,
        true,
      ),
      room(
        "r3",
        3,
        "Bamboo Single",
        "Bamboo · compact single",
        "Compact and quiet, for one traveller.",
        1,
        true,
      ),
    ],
    guests: [
      "Haruto Sato",
      "Yui Takahashi",
      "Sota Ito",
      "Emma Wilson",
      "Riku Nakamura",
      "Hina Kobayashi",
      "Liam O'Brien",
      "Mio Yamamoto",
      "Daniel Park",
      "Aoi Suzuki",
      "Lucas Ferreira",
      "Yuna Kato",
    ],
    channels: ["agoda", "booking_com", "airbnb", "direct", "agoda"],
    checkIn: "15:00",
    checkOut: "10:00",
    lateArrival: "23:30",
    trades: [
      {
        name: "Takeshi Yamada",
        company_name: "Kanda Setsubi",
        category: "plumbing",
        phone: "+819000000145",
        area: "Chiyoda and Chuo",
        notes: "Plumbing and water heaters.",
        rating: 4.8,
        is_preferred: true,
      },
      {
        name: "Naomi Fujita",
        company_name: "Midori Cleaning",
        category: "cleaning",
        phone: "+819000000167",
        area: "Central Tokyo",
        notes: "Turnovers 10:00–15:00.",
        rating: 4.9,
        is_preferred: true,
      },
      {
        name: "Kazuki Hara",
        company_name: "Hara Denki",
        category: "electrical",
        phone: "+819000000189",
        area: "Tokyo 23 wards",
        notes: "Air conditioners and lighting.",
        rating: 4.7,
      },
    ],
    extras: [
      late(200000),
      early(200000),
      {
        key: "pocket_wifi",
        name: "Pocket Wi-Fi",
        description: "Unlimited data, for exploring the city.",
        pricePence: 80000,
        unit: "item",
        maxQty: 2,
      },
      {
        key: "luggage_forwarding",
        name: "Luggage forwarding to your next stay",
        description: "Your suitcase sent ahead (arrives the next day).",
        pricePence: 250000,
        unit: "item",
        maxQty: 3,
      },
      {
        key: "yukata",
        name: "Yukata",
        pricePence: 0,
        unit: "item",
        maxQty: 2,
        isFree: true,
        isLoan: true,
        autoApprove: true,
      },
      {
        key: "bf_onigiri",
        name: "Onigiri pair to go",
        description: "Salmon and umeboshi rice balls with green tea.",
        pricePence: 60000,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "packed" },
      },
      {
        key: "bf_bento",
        name: "Breakfast bento",
        description: "Tamagoyaki, grilled fish, rice and pickles, brought to your room.",
        pricePence: 130000,
        unit: "item",
        maxQty: 2,
        breakfast: { style: "delivered" },
      },
      {
        key: "bf_japanese",
        name: "Japanese breakfast set",
        description: "Grilled salmon, miso soup, rice, tamagoyaki and pickles.",
        pricePence: 180000,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Sets" },
      },
      {
        key: "bf_western",
        name: "Western breakfast set",
        description: "Eggs, toast, salad, yoghurt and coffee.",
        pricePence: 150000,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Sets" },
      },
      {
        key: "bf_matcha",
        name: "Matcha latte",
        pricePence: 55000,
        unit: "item",
        maxQty: 4,
        breakfast: { style: "dining", section: "Drinks" },
      },
    ],
    guides: [
      {
        section_key: "getting_in",
        summary:
          "Use your code at the glass door, then take the lift to your floor. Please take your shoes off at the room entrance.",
      },
      {
        section_key: "shoes",
        summary: "Slippers are in the cupboard by your door. Shoes stay in the entrance (genkan).",
      },
      {
        section_key: "taxis",
        summary:
          "Taxis wait outside Kanda Station. Doors open by themselves: please don't pull them.",
      },
      {
        section_key: "rules",
        summary:
          "Please sort rubbish into burnable, plastic and bottles; the bins are by the lift. No smoking in the building.",
      },
      {
        section_key: "checkout",
        summary: "Check-out is 10am. Leave your key card in the box at the entrance.",
      },
    ],
    request: {
      category: "linen",
      title: "Extra towels",
      note: "Could we have two more bath towels, please?",
    },
    maintenance: {
      roomKey: "r1",
      category: "electrical",
      title: "Air conditioner remote",
      note: "Batteries are flat: replace before check-in.",
    },
    conversation: {
      ask: "Hello, is there a convenience store open all night near the hotel?",
      reply:
        "Yes, there's one opposite the building's entrance, open 24 hours. Kanda Station also has several.",
      waiting: "Our flight lands at Haneda at 9pm. Is a late arrival OK?",
    },
  },
];

export const SHOWCASE_CODES = SHOWCASE.map((s) => s.short_code);

export function showcaseByKey(key: string): ShowcaseSpec | null {
  return SHOWCASE.find((s) => s.key === key) ?? null;
}

/** Which demo a property code belongs to: "hill" (The Hill Suites' tour) or a regional key. */
export function demoKeyForCode(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code === "tour") return "hill";
  return SHOWCASE.find((s) => s.short_code === code)?.key ?? null;
}
