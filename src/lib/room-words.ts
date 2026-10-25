/**
 * Room codes as three everyday words ("amber-otter-harbour") instead of a
 * random string: easy to read off a card, say on the phone or type, and
 * unique across every room of every property (rooms.guide_words, migration
 * 0059; about 150 million combinations). Old printed codes (rooms.guide_code)
 * keep working. Pure.
 */

export const ROOM_WORDS: readonly string[] = [
  "acorn", "adder", "alder", "almond", "amber", "anchor", "angel", "apple", "apricot", "arbour", "arch", "arrow", "aspen", "aster", "attic",
  "autumn", "avenue", "azure", "badger", "bakery", "balcony", "bamboo", "banjo", "banner", "barley", "barn", "basil", "basket", "bay",
  "beacon", "beach", "bean", "bear", "beaver", "bee", "beech", "bell", "bench", "berry", "birch", "bird", "biscuit", "bison", "blossom",
  "bluebell", "boat", "bonnet", "book", "border", "bottle", "boulder", "bramble", "branch", "bread", "breeze", "brick", "bridge", "brook",
  "broom", "bubble", "bucket", "bud", "buffalo", "bugle", "bunny", "butter", "button", "buzzard", "cabin", "cactus", "cake", "camel",
  "camera", "canal", "candle", "canoe", "canyon", "cape", "caramel", "cardinal", "carpet", "carrot", "castle", "cedar", "cello", "chalk",
  "chapel", "charm", "cherry", "chestnut", "chime", "chimney", "chorus", "cider", "cinema", "circle", "citrus", "clay", "cliff", "clover",
  "cobble", "cocoa", "coconut", "comet", "compass", "copper", "coral", "cosmos", "cottage", "cotton", "country", "cove", "crane", "crayon",
  "creek", "cricket", "crocus", "crown", "crystal", "cuckoo", "cupcake", "curtain", "cushion", "cypress", "daisy", "dale", "dancer", "dawn",
  "deer", "delta", "denim", "desert", "dew", "diamond", "dingo", "dolphin", "domino", "donkey", "dove", "dragon", "dream", "drum", "duck",
  "dune", "eagle", "earth", "easel", "echo", "eclipse", "eel", "egret", "elder", "elm", "ember", "emerald", "engine", "estuary", "fable",
  "falcon", "fawn", "feather", "fennel", "fern", "ferry", "fiddle", "field", "fig", "finch", "fjord", "flame", "flamingo", "flint", "flower",
  "flute", "fog", "forest", "fossil", "fountain", "fox", "freesia", "frost", "fudge", "galaxy", "gale", "garden", "garnet", "gate",
  "gazelle", "gecko", "gem", "ginger", "glacier", "glade", "glen", "globe", "glove", "goose", "gorge", "granite", "grape", "grass", "grove",
  "guitar", "gull", "hamlet", "harbour", "hare", "harp", "harvest", "hawk", "hazel", "heath", "heather", "hedge", "heron", "hill", "hive",
  "holly", "honey", "hoop", "horizon", "horse", "hound", "hut", "ibis", "iceberg", "igloo", "indigo", "inlet", "iris", "island", "ivory",
  "ivy", "jacket", "jade", "jaguar", "jasmine", "jelly", "jetty", "jewel", "jigsaw", "journey", "juniper", "kayak", "kernel", "kestrel",
  "kettle", "kite", "kiwi", "koala", "ladder", "lagoon", "lake", "lamb", "lantern", "lark", "laurel", "lava", "lavender", "leaf", "lemon",
  "lilac", "lily", "lime", "linen", "lion", "lizard", "llama", "lobster", "locket", "lodge", "lotus", "lynx", "magnet", "magpie", "mango",
  "maple", "marble", "marigold", "marsh", "meadow", "melon", "mesa", "meteor", "mint", "mirror", "mist", "mitten", "moon", "moose", "moss",
  "moth", "mountain", "muffin", "mural", "nectar", "nest", "nettle", "nickel", "nightingale", "noodle", "north", "nutmeg", "oak", "oasis",
  "ocean", "olive", "onyx", "opal", "orange", "orbit", "orchard", "orchid", "otter", "owl", "oyster", "paddle", "pagoda", "palm", "panda",
  "pansy", "panther", "paper", "parrot", "pasta", "pastel", "peach", "peacock", "pearl", "pebble", "pelican", "penguin", "pepper", "petal",
  "pheasant", "piano", "pigeon", "pine", "pinecone", "planet", "plum", "pocket", "poem", "pond", "poppy", "porch", "prairie", "puffin",
  "pumpkin", "quail", "quartz", "quill", "quilt", "rabbit", "radish", "rain", "rainbow", "raven", "reef", "ribbon", "ridge", "river",
  "robin", "rocket", "rose", "rowan", "ruby", "rudder", "saddle", "saffron", "sage", "sail", "salmon", "sapphire", "satin", "scarf", "sea",
  "seal", "shell", "shore", "silver", "sky", "skylark", "slate", "sleigh", "snow", "sonnet", "sparrow", "spice", "spring", "spruce",
  "squirrel", "star", "stone", "stork", "stream", "summer", "sun", "sunset", "swallow", "swan", "sycamore", "tangerine", "teapot", "temple",
  "thistle", "thrush", "thunder", "thyme", "tide", "tiger", "timber", "toffee", "topaz", "tower", "trail", "tree", "tulip", "tundra",
  "turtle", "umbrella", "unicorn", "valley", "vanilla", "velvet", "violet", "violin", "voyage", "walnut", "walrus", "wave", "whale", "wheat",
  "willow", "window", "winter", "wisteria", "wolf", "wren", "yacht", "yarrow", "yew", "yoghurt", "zebra", "zephyr", "zinnia", "almanac",
  "anvil", "atlas", "aurora", "bonsai", "cameo", "cascade", "chalet", "cherub", "citadel", "clementine", "cobalt", "cockle", "cornflower",
  "crocodile", "curlew", "dahlia", "damson", "dandelion", "dovecote", "driftwood", "dunlin", "eider", "fieldfare", "firefly", "foxglove",
  "gannet", "gingham", "goldfinch", "gondola", "greenfinch", "harebell", "hawthorn", "hollyhock", "honeybee", "hummingbird", "kingfisher",
  "lapwing", "larch", "lighthouse", "lupin", "mallard", "marmalade", "meerkat", "minnow", "mistral", "monarch", "moorland", "narwhal",
  "nautilus", "nutshell", "oriole", "osprey", "pantry", "peony", "periwinkle", "petrel", "pippin", "plover", "primrose", "quince", "redwood",
  "rhubarb", "riverbank", "rosemary", "saltmarsh", "sandpiper", "seashell", "sherbet", "snowdrop", "songbird", "starling", "sunflower",
  "tapestry", "teal", "toucan", "trellis", "tumbleweed", "turnip", "twig", "valerian", "verbena", "warbler", "waterfall", "wildflower",
  "woodland",
];

const SET = new Set(ROOM_WORDS);

/** Three different words, joined with hyphens. */
export function newRoomWords(random: () => number = Math.random): string {
  const picked: string[] = [];
  while (picked.length < 3) {
    const w = ROOM_WORDS[Math.floor(random() * ROOM_WORDS.length)]!;
    if (!picked.includes(w)) picked.push(w);
  }
  return picked.join("-");
}

/** A code as typed or scanned (any case, dots or spaces between words) → "a-b-c", or null if it isn't three of our words. */
export function readRoomWords(raw: string | null | undefined): string | null {
  const parts = (raw ?? "").trim().toLowerCase().split(/[\s.\-_/]+/).filter(Boolean);
  if (parts.length !== 3 || !parts.every((p) => SET.has(p))) return null;
  return parts.join("-");
}

/** Anything a room link may carry: three words, or an older random code. */
export const ROOM_CODE = /^(?:[a-z]{3,11}-[a-z]{3,11}-[a-z]{3,11}|[a-z0-9]{8,24})$/;
