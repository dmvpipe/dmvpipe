import React, { useState, useEffect, useRef } from 'react';
import {
  Wrench, Home, Calendar, Phone, FileText, MessageSquare,
  AlertTriangle, CheckCircle, X, User, Clock, ShieldCheck,
  Droplet, MapPin, Send, Menu, LogOut, Info, Mail, Star, ChevronLeft,
  ShoppingCart, Plus, Minus, Trash2, Camera, Search
} from 'lucide-react';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut,
  GoogleAuthProvider, signInWithPopup
} from 'firebase/auth';
import {
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, setDoc, getDoc
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAnalytics } from "firebase/analytics";

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBro9UJnTwj8fghOL20fZOY1RxHglz7ZlA",
  authDomain: "dmvpipe.firebaseapp.com",
  projectId: "dmvpipe",
  storageBucket: "dmvpipe.firebasestorage.app",
  messagingSenderId: "203456030027",
  appId: "1:203456030027:web:6ec775c724835976e0b4ce",
  measurementId: "G-GJ4XHPCBDC"
};

const app = initializeApp(firebaseConfig);
const _analytics = getAnalytics(app);
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const storage = app ? getStorage(app) : null;
const appId = 'dmvpipe-app';

// --- LEAD EMAIL NOTIFICATIONS ---
// Every lead (chat, booking, emergency, contact) emails Ganaa via FormSubmit.
// NOTE: the first submission triggers an activation email to NOTIFY_EMAIL —
// open that inbox and click "Activate" once, then all notifications flow.
const NOTIFY_EMAIL = 'info@dmvpipe.com';
const notifyGanaa = async (subject, fields) => {
  try {
    await fetch(`https://formsubmit.co/ajax/${NOTIFY_EMAIL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ _subject: subject, _template: 'table', _captcha: 'false', ...fields })
    });
  } catch (err) {
    // Never block the customer flow on email problems; lead is still in Firestore.
    console.error('Notification email failed (lead still saved):', err);
  }
};

// --- CUSTOMER PHOTO UPLOADS ---
// Photos are compressed in the browser, stored in Firebase Storage, and the
// links are included in Ganaa's email + the Firestore lead.
const compressImage = (file, maxDim = 1000, quality = 0.65) => new Promise((resolve) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(b => { URL.revokeObjectURL(url); resolve(b || file); }, 'image/jpeg', quality);
  };
  img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
  img.src = url;
});

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('upload timeout')), ms))
]);

const uploadLeadPhotos = async (files) => {
  if (!storage || !files || !files.length) return [];
  // Compress + upload all photos in parallel; give up after 20s so the UI never hangs
  const results = await Promise.all(files.slice(0, 3).map(async (f) => {
    try {
      const blob = await compressImage(f);
      const r = storageRef(storage, `lead-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
      await withTimeout(uploadBytes(r, blob, { contentType: 'image/jpeg' }), 20000);
      return await withTimeout(getDownloadURL(r), 8000);
    } catch (e) {
      console.error('Photo upload failed (continuing without it):', e);
      return null;
    }
  }));
  return results.filter(Boolean);
};

// Reusable "add up to 3 photos" picker with thumbnails
function PhotoPicker({ photos, setPhotos, compact = false }) {
  const inputRef = useRef(null);
  const addFiles = (fileList) => {
    const imgs = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    setPhotos(prev => [...prev, ...imgs].slice(0, 3));
  };
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {photos.map((f, i) => (
          <div key={i} className="relative">
            <img src={URL.createObjectURL(f)} alt={`Photo ${i + 1}`} className={`${compact ? 'w-12 h-12' : 'w-16 h-16'} object-cover rounded-lg border border-stone-200`} />
            <button type="button" onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))} aria-label="Remove photo"
              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow"><X className="w-3 h-3"/></button>
          </div>
        ))}
        {photos.length < 3 && (
          <button type="button" onClick={() => inputRef.current?.click()}
            className={`${compact ? 'w-12 h-12' : 'w-16 h-16'} border-2 border-dashed border-stone-300 hover:border-blue-400 rounded-lg flex flex-col items-center justify-center text-stone-400 hover:text-blue-600 transition-colors`}>
            <Camera className={compact ? 'w-4 h-4' : 'w-5 h-5'}/>
            {!compact && <span className="text-[9px] font-bold mt-0.5">Add</span>}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

// --- DATA ---
const VA_CITIES = [
  "Arlington", "Alexandria", "Fairfax", "Falls Church", "McLean", 
  "Vienna", "Reston", "Herndon", "Annandale", "Springfield", 
  "Burke", "Centreville", "Chantilly", "Oakton", "Tysons", 
  "Great Falls", "Lorton", "Sterling", "Ashburn", "Leesburg"
];

const SERVICES = [
  { title: "Leak Detection & Repair", desc: "Fast and reliable fixes for all types of residential leaks.", icon: <Droplet className="w-8 h-8 text-blue-500" /> },
  { title: "Water Heater Installation", desc: "Tank and tankless water heater repair and replacement.", icon: <Wrench className="w-8 h-8 text-blue-500" /> },
  { title: "Pipe Repair & Replacement", desc: "Complete re-piping and localized repairs for aging homes.", icon: <Wrench className="w-8 h-8 text-blue-500" /> },
  { title: "Drain Cleaning", desc: "Clearing tough clogs from sinks, tubs, and main lines.", icon: <Droplet className="w-8 h-8 text-blue-500" /> }
];

// --- MATERIALS SHOP ---
// Prices match Home Depot equivalents — GANAA MUST VERIFY/UPDATE regularly.
// Images are original illustrations; swap any img for a real photo (e.g. '/products/photos/wh-gas-40.jpg').
const PRODUCTS = [
  // Water Heaters
  { id: 'wh-gas-40', cat: 'Water Heaters', name: 'Rheem Performance 40 Gal. Natural Gas Tank Water Heater', price: 549, unit: 'each', img: '/products/items/wh-gas.svg' },
  { id: 'wh-gas-50', cat: 'Water Heaters', name: 'Rheem Performance 50 Gal. Natural Gas Tank Water Heater', price: 629, unit: 'each', img: '/products/items/wh-gas.svg' },
  { id: 'wh-elec-40', cat: 'Water Heaters', name: 'Rheem Performance 40 Gal. Electric Tank Water Heater', price: 519, unit: 'each', img: '/products/items/wh-elec.svg' },
  { id: 'wh-elec-50', cat: 'Water Heaters', name: 'Rheem Performance 50 Gal. Electric Tank Water Heater', price: 599, unit: 'each', img: '/products/items/wh-elec.svg' },
  { id: 'wh-tankless', cat: 'Water Heaters', name: 'Rheem 8.4 GPM Tankless Gas Water Heater', price: 1299, unit: 'each', img: '/products/items/wh-tankless.svg' },
  { id: 'wh-pan', cat: 'Water Heaters', name: 'Water Heater Drain Pan with PVC Fitting (24 in.)', price: 27, unit: 'each', img: '/products/items/wh-pan.svg' },
  { id: 'wh-exp-tank', cat: 'Water Heaters', name: 'Thermal Expansion Tank (2 Gal.)', price: 45, unit: 'each', img: '/products/items/exp-tank.svg' },
  { id: 'tprv-valve', cat: 'Water Heaters', name: 'T&P Relief Valve for Water Heater', price: 18, unit: 'each', img: '/products/items/tprv.svg' },

  // Toilets & Parts
  { id: 'toilet-highline', cat: 'Toilets & Parts', name: 'Kohler Highline 2-Piece Elongated Toilet (1.28 GPF)', price: 239, unit: 'each', img: '/products/items/toilet.svg' },
  { id: 'toilet-champion', cat: 'Toilets & Parts', name: 'American Standard Champion 4 Toilet (1.6 GPF)', price: 289, unit: 'each', img: '/products/items/toilet.svg' },
  { id: 'toilet-cadet', cat: 'Toilets & Parts', name: 'American Standard Cadet 3 Round Toilet (Compact)', price: 199, unit: 'each', img: '/products/items/toilet.svg' },
  { id: 'fill-valve-kit', cat: 'Toilets & Parts', name: 'Fluidmaster Fill Valve & Flapper Complete Repair Kit', price: 22, unit: 'kit', img: '/products/items/fill-valve.svg' },
  { id: 'toilet-flapper', cat: 'Toilets & Parts', name: 'Korky 2 in. Toilet Flapper (Universal)', price: 9, unit: 'each', img: '/products/items/flapper.svg' },
  { id: 'trip-lever', cat: 'Toilets & Parts', name: 'Toilet Trip Lever / Flush Handle (Chrome)', price: 12, unit: 'each', img: '/products/items/trip-lever.svg' },
  { id: 'wax-ring', cat: 'Toilets & Parts', name: 'Wax Ring Kit with Brass Bolts', price: 8, unit: 'kit', img: '/products/items/wax-ring.svg' },
  { id: 'toilet-seat', cat: 'Toilets & Parts', name: 'Soft-Close Elongated Toilet Seat (White)', price: 32, unit: 'each', img: '/products/items/toilet-seat.svg' },
  { id: 'toilet-flange', cat: 'Toilets & Parts', name: 'PVC Toilet Flange Repair Kit', price: 15, unit: 'kit', img: '/products/items/flange.svg' },

  // Faucets & Sinks
  { id: 'faucet-kitchen', cat: 'Faucets & Sinks', name: 'Moen Adler Single-Handle Kitchen Faucet with Sprayer', price: 89, unit: 'each', img: '/products/items/faucet-kitchen.svg' },
  { id: 'faucet-kitchen-pd', cat: 'Faucets & Sinks', name: 'Moen Arbor Pull-Down Kitchen Faucet (Spot Resist)', price: 229, unit: 'each', img: '/products/items/faucet-pd.svg' },
  { id: 'faucet-bath', cat: 'Faucets & Sinks', name: 'Delta Foundations 4 in. Bathroom Faucet (Chrome)', price: 59, unit: 'each', img: '/products/items/faucet-bath.svg' },
  { id: 'faucet-bath-brushed', cat: 'Faucets & Sinks', name: 'Moen Genta 4 in. Bathroom Faucet (Brushed Nickel)', price: 119, unit: 'each', img: '/products/items/faucet-bath.svg' },
  { id: 'sink-kitchen', cat: 'Faucets & Sinks', name: 'Stainless Steel Double-Bowl Drop-In Kitchen Sink (33 in.)', price: 189, unit: 'each', img: '/products/items/sink-ss.svg' },
  { id: 'shower-valve', cat: 'Faucets & Sinks', name: 'Delta Shower Valve Trim Kit with Cartridge', price: 145, unit: 'kit', img: '/products/items/shower-valve.svg' },
  { id: 'showerhead', cat: 'Faucets & Sinks', name: 'Moen Engage Magnetix Handheld Shower Head', price: 79, unit: 'each', img: '/products/items/showerhead.svg' },
  { id: 'faucet-aerator', cat: 'Faucets & Sinks', name: 'Faucet Aerator 1.5 GPM (2-Pack)', price: 6, unit: 'pack', img: '/products/items/aerator.svg' },

  // Drains & Disposals
  { id: 'disposal-badger5', cat: 'Drains & Disposals', name: 'InSinkErator Badger 5, 1/2 HP Garbage Disposal', price: 109, unit: 'each', img: '/products/items/disposal.svg' },
  { id: 'disposal-evolution', cat: 'Drains & Disposals', name: 'InSinkErator Evolution Compact 3/4 HP (Quiet)', price: 219, unit: 'each', img: '/products/items/disposal.svg' },
  { id: 'ptrap-kit', cat: 'Drains & Disposals', name: 'PVC P-Trap Kit 1-1/2 in. with Fittings', price: 9, unit: 'kit', img: '/products/items/ptrap.svg' },
  { id: 'pop-up', cat: 'Drains & Disposals', name: 'Bathroom Sink Pop-Up Drain Assembly', price: 18, unit: 'each', img: '/products/items/popup.svg' },
  { id: 'tub-drain', cat: 'Drains & Disposals', name: 'Tub Drain & Overflow Trim Kit (Chrome)', price: 39, unit: 'kit', img: '/products/items/tub-drain.svg' },
  { id: 'sink-strainer', cat: 'Drains & Disposals', name: 'Kitchen Sink Basket Strainer (Stainless)', price: 14, unit: 'each', img: '/products/items/strainer.svg' },
  { id: 'hair-snake', cat: 'Drains & Disposals', name: 'Plastic Drain Hair Snake (3-Pack)', price: 6, unit: 'pack', img: '/products/items/hair-snake.svg' },

  // Pumps
  { id: 'sump-13hp', cat: 'Pumps', name: 'Everbilt 1/3 HP Submersible Sump Pump', price: 159, unit: 'each', img: '/products/items/sump.svg' },
  { id: 'sump-12hp', cat: 'Pumps', name: 'Zoeller M53 1/3 HP Cast Iron Sump Pump (Pro Grade)', price: 219, unit: 'each', img: '/products/items/sump.svg' },
  { id: 'sump-battery', cat: 'Pumps', name: 'Battery Backup Sump Pump System', price: 449, unit: 'each', img: '/products/items/sump-battery.svg' },
  { id: 'sewage-ejector', cat: 'Pumps', name: '1/2 HP Sewage Ejector Pump', price: 289, unit: 'each', img: '/products/items/sewage.svg' },

  // Pipes & Fittings
  { id: 'pex-a-34', cat: 'Pipes & Fittings', name: 'PEX-A Tubing 3/4 in. x 100 ft. Roll', price: 89, unit: 'roll', img: '/products/items/pex.svg' },
  { id: 'pex-a-12', cat: 'Pipes & Fittings', name: 'PEX-A Tubing 1/2 in. x 100 ft. Roll', price: 55, unit: 'roll', img: '/products/items/pex.svg' },
  { id: 'copper-34', cat: 'Pipes & Fittings', name: 'Copper Pipe Type L 3/4 in. x 10 ft.', price: 42, unit: 'stick', img: '/products/items/copper.svg' },
  { id: 'sharkbite-fittings', cat: 'Pipes & Fittings', name: 'SharkBite Push-Fit Coupling 3/4 in. (2-Pack)', price: 19, unit: 'pack', img: '/products/items/sharkbite.svg' },
  { id: 'pvc-dwv', cat: 'Pipes & Fittings', name: 'PVC DWV Pipe 2 in. x 10 ft.', price: 17, unit: 'stick', img: '/products/items/pvc.svg' },
  { id: 'pipe-insulation', cat: 'Pipes & Fittings', name: 'Foam Pipe Insulation 3/4 in. x 6 ft.', price: 5, unit: 'each', img: '/products/items/insulation.svg' },

  // Valves & Supply Lines
  { id: 'supply-lines', cat: 'Valves & Supply Lines', name: 'Braided Stainless Faucet Supply Lines (Pair)', price: 12, unit: 'pair', img: '/products/items/supply-line.svg' },
  { id: 'toilet-supply', cat: 'Valves & Supply Lines', name: 'Braided Stainless Toilet Supply Line', price: 8, unit: 'each', img: '/products/items/supply-line.svg' },
  { id: 'shutoff-valve', cat: 'Valves & Supply Lines', name: '1/4-Turn Angle Shut-Off Valve 1/2 in.', price: 11, unit: 'each', img: '/products/items/angle-stop.svg' },
  { id: 'main-shutoff', cat: 'Valves & Supply Lines', name: 'Main Shut-Off Ball Valve 3/4 in. (Full Port)', price: 24, unit: 'each', img: '/products/items/ball-valve.svg' },
  { id: 'prv-valve', cat: 'Valves & Supply Lines', name: 'Water Pressure Reducing Valve 3/4 in.', price: 89, unit: 'each', img: '/products/items/prv.svg' },
  { id: 'washer-hoses', cat: 'Valves & Supply Lines', name: 'Washing Machine Hoses, Braided Stainless (Pair)', price: 25, unit: 'pair', img: '/products/items/washer-hose.svg' },
  { id: 'hose-bibb', cat: 'Valves & Supply Lines', name: 'Frost-Free Outdoor Hose Bibb / Spigot', price: 29, unit: 'each', img: '/products/items/hosebib.svg' },
  { id: 'gas-connector', cat: 'Valves & Supply Lines', name: 'Gas Appliance Flex Connector 3/4 in. x 36 in.', price: 19, unit: 'each', img: '/products/items/gasflex.svg' },

  // Small Parts & Repair
  { id: 'teflon-tape', cat: 'Small Parts & Repair', name: 'PTFE Thread Seal Tape (Teflon, 2-Pack)', price: 2, unit: 'pack', img: '/products/items/teflon.svg' },
  { id: 'plumbers-putty', cat: 'Small Parts & Repair', name: "Plumber's Putty 14 oz.", price: 5, unit: 'tub', img: '/products/items/putty.svg' },
  { id: 'silicone-caulk', cat: 'Small Parts & Repair', name: 'Kitchen & Bath Silicone Caulk (White)', price: 9, unit: 'tube', img: '/products/items/caulk.svg' },

  // Pro & Specialty (imported from Ganaa's curation list — TEST BATCH.
  // PRICES ARE ESTIMATES, Ganaa must verify before customers order.)
  { id: 'drain-tape', cat: 'Pro & Specialty', name: 'Drain & Pipe Repair Tape (Self-Fusing)', price: 8, unit: 'roll', img: null },
  { id: 'torch-regulator', cat: 'Pro & Specialty', name: 'TurboTorch Acetylene Regulator', price: 95, unit: 'each', img: null },
  { id: 'acetylene-refill', cat: 'Pro & Specialty', name: 'Acetylene B-Tank Refill / Exchange', price: 75, unit: 'each', img: null },
  { id: 'acid-neutralizer', cat: 'Pro & Specialty', name: 'RectorSeal Condensate Acid Neutralizer Kit', price: 45, unit: 'kit', img: null },
  { id: 'acid-test-kit', cat: 'Pro & Specialty', name: 'Refrigeration Oil Acid Test Kit', price: 22, unit: 'kit', img: null },
  { id: 'caulk-adapter', cat: 'Pro & Specialty', name: 'Caulk Gun Adapter / Nozzle Set', price: 6, unit: 'set', img: null },
  { id: 'hvac-adapter', cat: 'Pro & Specialty', name: 'Super Pro HVAC Service Adapter', price: 12, unit: 'each', img: null },
  { id: 'tub-tile-caulk', cat: 'Pro & Specialty', name: 'Tub & Tile Caulk (White)', price: 9, unit: 'tube', img: null },
  { id: 'oil-absorbent', cat: 'Pro & Specialty', name: 'Oil-Dri Premium Absorbent Bag', price: 14, unit: 'bag', img: null },
  { id: 'mill-rose-abrasive', cat: 'Pro & Specialty', name: 'Mill-Rose Abrasive Cloth Roll (Plumber Grade)', price: 11, unit: 'roll', img: null },
];

const CATEGORY_ICONS = {
  'Water Heaters': <Wrench className="w-8 h-8" />,
  'Toilets & Parts': <Home className="w-8 h-8" />,
  'Faucets & Sinks': <Droplet className="w-8 h-8" />,
  'Drains & Disposals': <Droplet className="w-8 h-8" />,
  'Pumps': <Wrench className="w-8 h-8" />,
  'Pipes & Fittings': <Wrench className="w-8 h-8" />,
  'Valves & Supply Lines': <Wrench className="w-8 h-8" />,
};

const BLOG_POSTS = [
  { 
    id: 1, 
    slug: "prevent-frozen-pipes-virginia",
    title: "How to Prevent Frozen Pipes During Virginia Winters", 
    date: "Nov 15, 2025", 
    excerpt: "Winter in the DMV area can be harsh. Learn the top 3 ways to insulate your pipes and avoid a costly burst.",
    content: (
      <>
        <p>Winter in the DMV area can bring sudden, freezing temperature drops that put your home's plumbing at serious risk. When water freezes inside a pipe, it expands, creating immense pressure that can cause even the strongest copper or PVC pipes to burst.</p>
        <h4 className="text-xl font-bold text-slate-900 mt-8 mb-4">1. Insulate Exposed Pipes</h4>
        <p>The most vulnerable pipes are those located in unheated areas of your home, such as basements, crawl spaces, attics, and garages. Use foam pipe insulation sleeves or heated tape to wrap these pipes securely.</p>
        <h4 className="text-xl font-bold text-slate-900 mt-8 mb-4">2. Let the Faucets Drip</h4>
        <p>If you know a deep freeze is coming overnight, turn on your faucets just enough to allow a slow, steady drip. Moving water is much less likely to freeze, and the open faucet provides relief for any pressure buildup inside the pipes.</p>
        <h4 className="text-xl font-bold text-slate-900 mt-8 mb-4">3. Keep the Heat On</h4>
        <p>If you are traveling for the holidays, do not turn your heater completely off. Leave it set to at least 55°F (13°C). Additionally, open cabinet doors under your kitchen and bathroom sinks to allow the warm air from your home to circulate around the pipes.</p>
        <div className="bg-blue-50 border-l-4 border-blue-600 p-5 mt-10 rounded-r-lg">
          <p className="font-bold text-blue-900 flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> Emergency Tip</p>
          <p className="text-blue-800 text-sm mt-2 leading-relaxed">If you turn on your faucet and nothing comes out, your pipe is likely already frozen. Locate your main water shut-off valve immediately to prevent flooding when it thaws, and contact DMVPipe right away.</p>
        </div>
      </>
    )
  },
  { 
    id: 2, 
    slug: "signs-water-heater-failing",
    title: "5 Signs Your Water Heater is Failing", 
    date: "Oct 02, 2025", 
    excerpt: "Don't wait for a cold shower. Look out for these warning signs that your water heater needs Ganaa's attention.",
    content: (
      <>
        <p>Your water heater is one of the hardest-working appliances in your home, running 24/7 to ensure your family has warm water. Unfortunately, they don't last forever. Most traditional tank water heaters have a lifespan of 8 to 12 years. Here are the top signs that yours might be on its last legs.</p>
        <ul className="space-y-6 mt-8">
          <li>
            <h4 className="text-lg font-bold text-slate-900">1. Strange Rumbling Noises</h4>
            <p className="mt-2 text-slate-600">As water heaters age, sediment builds up at the bottom of the tank. When the heater runs, this sediment is heated and reheated, causing it to harden and bang against the sides of the tank.</p>
          </li>
          <li>
            <h4 className="text-lg font-bold text-slate-900">2. Rusty or Discolored Water</h4>
            <p className="mt-2 text-slate-600">If the hot water coming from your taps looks rusty or brownish, your tank may be rusting away from the inside. This is a major warning sign that a leak is imminent.</p>
          </li>
          <li>
            <h4 className="text-lg font-bold text-slate-900">3. Not Enough Hot Water</h4>
            <p className="mt-2 text-slate-600">If you find yourself running out of hot water faster than you used to, the heating element may be failing, or sediment may be taking up too much space in the tank.</p>
          </li>
          <li>
            <h4 className="text-lg font-bold text-slate-900">4. Leaks Around the Base</h4>
            <p className="mt-2 text-slate-600">Check the floor around your water heater. If you see pooling water, the metal tank expands and contracts with heat, eventually creating micro-fractures that leak.</p>
          </li>
        </ul>
        <p className="mt-8 font-medium">If you notice any of these signs, don't wait for a total breakdown. Ganaa specializes in both traditional and modern tankless water heater replacements.</p>
      </>
    )
  },
  { 
    id: 3, 
    slug: "why-residential-plumbing-only",
    title: "Why We Only Do Residential Plumbing", 
    date: "Sep 18, 2025", 
    excerpt: "By focusing entirely on homes, we bring specialized care and respect to your family's personal space.",
    content: (
      <>
        <p>Many plumbing companies in the DMV area boast about handling "everything from giant corporate high-rises to tiny apartments." While that sounds impressive, at DMVPipe, we consciously made the decision to do the exact opposite.</p>
        <p className="mt-4"><strong>We only service residential homes. Period.</strong></p>
        <h4 className="text-xl font-bold text-slate-900 mt-8 mb-4">Focus Equals Excellence</h4>
        <p>Commercial plumbing involves massive industrial boilers, miles of pipe networks, and dealing with property management conglomerates. It's a completely different skillset. By focusing strictly on residential plumbing, Ganaa has mastered the exact systems that power your family's daily life.</p>
        <h4 className="text-xl font-bold text-slate-900 mt-8 mb-4">Respect for Your Space</h4>
        <p>A home is not a construction site. We understand that we are stepping into your family's sanctuary. Because we only work in homes, we have strict protocols for cleanliness. We wear shoe covers, protect your flooring, and leave the workspace cleaner than we found it.</p>
        <h4 className="text-xl font-bold text-slate-900 mt-8 mb-4">Direct Communication</h4>
        <p>When you call a company that handles commercial contracts, you are often routed through dispatchers and junior technicians. At DMVPipe, you get personalized, direct service from a master plumber who treats your home like it was his own.</p>
      </>
    )
  }
];

export default function App() {
  const [currentView, setCurrentView] = useState(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.substring(1);
      return path || 'home';
    }
    return 'home';
  });

  const [user, setUser] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);

  // Materials cart: { [productId]: quantity } — persisted so it survives reloads
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem('dmvpipe_cart')) || {}; } catch { return {}; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('dmvpipe_cart', JSON.stringify(cart)); } catch { /* private mode */ }
  }, [cart]);
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const updateCart = (id, delta) => {
    setCart(prev => {
      const qty = (prev[id] || 0) + delta;
      const next = { ...prev };
      if (qty <= 0) delete next[id]; else next[id] = qty;
      return next;
    });
  };
  const clearCart = () => setCart({});

  useEffect(() => {
    const formattedView = currentView.toLowerCase();
    let title = "DMVPipe - Ganaa's Plumbing | Residential Plumber in DMV";
    let desc = "Family-owned residential plumbing services in the DMV area. 15+ years of master plumbing experience.";

    if (formattedView === 'services') {
      title = "Residential Plumbing Services | DMVPipe Northern VA";
      desc = "Expert leak detection, water heater repair, pipe replacement, and drain cleaning strictly for residential homes in Northern VA.";
    } else if (formattedView === 'contact') {
      title = "Contact DMVPipe | 24/7 Emergency Plumbing in DMV";
      desc = "Call 703-655-6351 for fast, reliable residential plumbing. Serving Arlington, Alexandria, Fairfax, and 17 more cities.";
    } else if (formattedView === 'blog') {
      title = "Plumbing Tips & Blog | DMVPipe";
      desc = "Learn how to maintain your home's plumbing, prevent frozen pipes, and spot water heater issues early.";
    } else if (formattedView === 'account') {
      title = "Book a Service | DMVPipe Residential Plumbing";
      desc = "Book Ganaa for leak repair, water heaters, drains and more. No account needed — he confirms every request personally.";
    } else if (formattedView === 'shop') {
      title = "Plumbing Materials Shop | DMVPipe Northern VA";
      desc = "Order quality plumbing materials at Home Depot prices — water heaters, faucets, toilets, disposals — installed by a licensed master plumber, one bill for everything.";
    } else if (VA_CITIES.map(c => c.toLowerCase().replace(/\s+/g, '-')).includes(formattedView)) {
      const cityIndex = VA_CITIES.findIndex(c => c.toLowerCase().replace(/\s+/g, '-') === formattedView);
      const cityName = VA_CITIES[cityIndex];
      title = `Plumber in ${cityName}, VA | DMVPipe Residential Services`;
      desc = `Looking for a trusted residential plumber in ${cityName}, Virginia? DMVPipe brings 15+ years of master plumbing experience directly to your home. Call 703-655-6351.`;
    } else if (formattedView.startsWith('post-')) {
      const slug = formattedView.replace('post-', '');
      const post = BLOG_POSTS.find(p => p.slug === slug);
      if (post) {
        title = `${post.title} | DMVPipe Plumbing Blog`;
        desc = post.excerpt;
      }
    } else if (formattedView !== 'home') {
      title = "Page Not Found | DMVPipe";
      desc = "The page you are looking for does not exist. Explore our residential plumbing services in Northern Virginia.";
    }

    document.title = title;
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = "description";
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", desc);

    // Keep canonical URL in sync with the current page
    const pagePath = formattedView === 'home' ? '' : formattedView;
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `https://dmvpipe.com/${pagePath}`);

    // Keep social share tags in sync
    const syncMeta = (selector, value) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute('content', value);
    };
    syncMeta('meta[property="og:title"]', title);
    syncMeta('meta[property="og:description"]', desc);
    syncMeta('meta[property="og:url"]', `https://dmvpipe.com/${pagePath}`);
    syncMeta('meta[name="twitter:title"]', title);
    syncMeta('meta[name="twitter:description"]', desc);
  }, [currentView]);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.substring(1) || 'home';
      setCurrentView(path);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (view) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
    window.history.pushState({}, '', `/${view === 'home' ? '' : view}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof window !== 'undefined' && window.__initial_auth_token) {
          await signInWithCustomToken(auth, window.__initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        if (error && error.code === 'auth/admin-restricted-operation') {
          console.warn("Auth warning (non-fatal):", error.message || error);
        } else {
          console.error("Auth error:", error);
        }
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  const isCityView = VA_CITIES.map(c => c.toLowerCase().replace(/\s+/g, '-')).includes(currentView.toLowerCase());
  const activeCityName = isCityView ? VA_CITIES.find(c => c.toLowerCase().replace(/\s+/g, '-') === currentView.toLowerCase()) : '';
  const isPostView = currentView.startsWith('post-');

  return (
    <HelmetProvider>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col relative">
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <div className="flex items-center cursor-pointer gap-2 sm:gap-3" onClick={() => navigate('home')}>
              <img src="/logo-mark.png" alt="DMVPipe" className="h-10 w-10 sm:h-12 sm:w-12 rounded-full shadow-sm mr-1 sm:mr-2" />
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-black leading-none tracking-tight">DMVPipe</h1>
                <p className="text-[10px] sm:text-xs text-blue-600 font-semibold tracking-wider uppercase mt-1">Ganaa's Plumbing</p>
              </div>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex space-x-7 items-center">
              <button onClick={() => navigate('home')} className={`font-semibold transition-colors ${currentView === 'home' ? 'text-blue-700' : 'text-stone-600 hover:text-blue-700'}`}>Home</button>
              <button onClick={() => navigate('services')} className={`font-semibold transition-colors ${currentView === 'services' ? 'text-blue-700' : 'text-stone-600 hover:text-blue-700'}`}>Services</button>
              <button onClick={() => navigate('shop')} className={`font-semibold transition-colors flex items-center gap-1.5 ${currentView === 'shop' ? 'text-blue-700' : 'text-stone-600 hover:text-blue-700'}`}>
                Shop
                {cartCount > 0 && <span className="bg-amber-400 text-stone-900 text-xs font-extrabold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">{cartCount}</span>}
              </button>
              <button onClick={() => navigate('blog')} className={`font-semibold transition-colors ${currentView.includes('blog') || currentView.includes('post-') ? 'text-blue-700' : 'text-stone-600 hover:text-blue-700'}`}>Blog</button>
              <button onClick={() => navigate('contact')} className={`font-semibold transition-colors ${currentView === 'contact' ? 'text-blue-700' : 'text-stone-600 hover:text-blue-700'}`}>Contact</button>

              <div className="pl-5 border-l border-stone-200 flex items-center gap-3">
                <a
                  href="tel:7036556351"
                  className="flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-stone-900 px-5 py-2.5 rounded-full font-bold transition-colors shadow-sm"
                >
                  <Phone className="w-4 h-4" /> 703-655-6351
                </a>
                <button
                  onClick={() => navigate('account')}
                  className="flex items-center gap-2 bg-blue-900 text-white px-5 py-2.5 rounded-full font-semibold hover:bg-blue-800 transition-colors"
                >
                  {user && !user.isAnonymous && user.photoURL ? (
                    <img src={user.photoURL} alt="User" className="w-5 h-5 rounded-full" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                  {user && !user.isAnonymous ? "My Dashboard" : "Book Online"}
                </button>
              </div>
            </nav>

            {/* Mobile: call button + menu */}
            <div className="md:hidden flex items-center gap-2">
              <a href="tel:7036556351" className="bg-amber-400 text-stone-900 p-2.5 rounded-full shadow-sm" aria-label="Call DMVPipe">
                <Phone className="w-5 h-5" />
              </a>
              <button className="p-2" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Nav */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 px-4 pt-2 pb-6 space-y-2 shadow-lg">
            <button onClick={() => navigate('home')} className="block w-full text-left py-3 px-4 rounded-lg hover:bg-slate-50 font-medium text-slate-700">Home</button>
            <button onClick={() => navigate('services')} className="block w-full text-left py-3 px-4 rounded-lg hover:bg-slate-50 font-medium text-slate-700">Services</button>
            <button onClick={() => navigate('shop')} className="w-full text-left py-3 px-4 rounded-lg hover:bg-slate-50 font-medium text-slate-700 flex items-center gap-2">
              Materials Shop
              {cartCount > 0 && <span className="bg-amber-400 text-stone-900 text-xs font-extrabold rounded-full px-1.5 py-0.5">{cartCount}</span>}
            </button>
            <button onClick={() => navigate('blog')} className="block w-full text-left py-3 px-4 rounded-lg hover:bg-slate-50 font-medium text-slate-700">Blog</button>
            <button onClick={() => navigate('contact')} className="block w-full text-left py-3 px-4 rounded-lg hover:bg-slate-50 font-medium text-slate-700">Contact</button>
            <div className="pt-2 space-y-2">
              <a href="tel:7036556351" className="flex items-center justify-center gap-2 w-full bg-amber-400 text-stone-900 py-3 rounded-lg font-bold">
                <Phone className="w-5 h-5" /> Call 703-655-6351
              </a>
              <button onClick={() => navigate('account')} className="flex items-center justify-center gap-2 w-full bg-blue-900 text-white py-3 rounded-lg font-semibold">
                <User className="w-5 h-5" /> {user && !user.isAnonymous ? "My Dashboard" : "Book Online"}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="grow min-h-[60vh]">
        {currentView === 'home' && <HomeView navigate={navigate} />}
        {currentView === 'services' && <ServicesView navigate={navigate} />}
        {currentView === 'blog' && <BlogHubView navigate={navigate} />}
        {currentView === 'contact' && <ContactView user={user} />}
        {currentView === 'account' && <AccountView user={user} db={db} appId={appId} cart={cart} updateCart={updateCart} clearCart={clearCart} navigate={navigate} />}
        {currentView === 'shop' && <ShopView navigate={navigate} cart={cart} updateCart={updateCart} />}

        {isCityView && <CityView navigate={navigate} city={activeCityName} />}
        {isPostView && <BlogPostView navigate={navigate} slug={currentView.replace('post-', '')} />}
        {!['home', 'services', 'blog', 'contact', 'account', 'shop'].includes(currentView) && !isCityView && !isPostView && (
          <NotFoundView navigate={navigate} />
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-blue-950 text-blue-100/80 py-8 sm:py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center mb-4">
              <img src="/logo-mark.png" alt="DMVPipe" className="h-8 w-8 rounded-full mr-2" />
              <h2 className="text-lg sm:text-xl font-bold text-white">DMVPipe</h2>
            </div>
            <p className="text-xs sm:text-sm mb-4">Ganaa's Family Owned Plumbing. Serving the DMV area with 15+ years of trusted residential experience.</p>
            <p className="text-xs sm:text-sm flex items-center gap-2 text-blue-200/70">
              <ShieldCheck className="w-4 h-4 text-amber-400" /> Virginia Class A Contractor · Licensed Master Plumber · Fully Insured
            </p>
            {/* TODO: add license number when available, e.g. "Lic. #2705-XXXXXX — verify at dpor.virginia.gov" */}
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><button onClick={() => navigate('services')} className="hover:text-white transition-colors">Residential Services</button></li>
              <li><button onClick={() => navigate('shop')} className="hover:text-white transition-colors">Materials Shop</button></li>
              <li><button onClick={() => navigate('blog')} className="hover:text-white transition-colors">Plumbing Tips</button></li>
              <li><button onClick={() => navigate('contact')} className="hover:text-white transition-colors">Contact Us</button></li>
              <li><button onClick={() => navigate('account')} className="hover:text-white transition-colors">Customer Login</button></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Contact</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-amber-400 shrink-0" />
                <span><a href="tel:7036556351" className="hover:text-white font-semibold">703-655-6351</a><br/><span className="text-xs text-blue-200/60">24/7 Emergency Available</span></span>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-blue-500 shrink-0" />
                <span>info@dmvpipe.com</span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-blue-500 shrink-0" />
                <span>Serving 20 Cities in Northern Virginia closest to D.C.</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-slate-800 text-xs sm:text-sm text-center text-slate-500 flex flex-col items-center">
          <p className="mb-2 sm:mb-4">&copy; {new Date().getFullYear()} DMVPipe - Ganaa's Plumbing. All rights reserved.</p>
          <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 sm:gap-x-3 text-[10px] sm:text-xs text-slate-600 max-w-4xl">
            {VA_CITIES.map(city => {
              const cityUrl = city.toLowerCase().replace(/\s+/g, '-');
              return (
                <button key={city} onClick={() => navigate(cityUrl)} className="hover:text-white transition-colors px-1 sm:px-2 py-0.5">
                  Plumber in {city}
                </button>
              )
            })}
          </div>
        </div>
      </footer>

      {/* FLOATING WIDGETS */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
        {isEmergencyOpen && (
          <div className="bg-white rounded-2xl shadow-2xl border border-red-100 w-[calc(100vw-3rem)] max-w-sm sm:w-96 overflow-hidden animate-in slide-in-from-bottom-5">
            <div className="bg-red-600 text-white p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold">Emergency Request</h3>
              </div>
              <button onClick={() => setIsEmergencyOpen(false)} className="hover:bg-red-700 p-1 rounded transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <EmergencyForm db={db} user={user} appId={appId} onClose={() => setIsEmergencyOpen(false)} />
          </div>
        )}

        {isChatOpen && !isEmergencyOpen && (
          <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-[calc(100vw-3rem)] max-w-sm sm:w-96 h-[65dvh] max-h-[560px] flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
            <div className="bg-gradient-to-r from-blue-900 to-blue-950 text-white px-4 py-3 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <img src="/logo-mark.png" alt="" className="w-9 h-9 rounded-full ring-2 ring-white/20" />
                <div>
                  <h3 className="font-bold text-sm leading-tight">DMVPipe Help Chat</h3>
                  <p className="text-[11px] text-blue-200 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block"></span> Ganaa's assistant — online
                  </p>
                </div>
              </div>
              <button onClick={() => setIsChatOpen(false)} aria-label="Close chat" className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <ChatbotUI user={user} db={db} appId={appId} />
          </div>
        )}

        <div className="flex gap-3">
          {!isEmergencyOpen && (
             <button 
             onClick={() => { setIsEmergencyOpen(true); setIsChatOpen(false); }}
             className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-full shadow-lg flex items-center gap-2 font-bold transition-transform hover:scale-105"
           >
             <AlertTriangle className="w-5 h-5" />
             <span className="hidden sm:inline">Emergency Help</span>
           </button>
          )}
          
          {!isChatOpen && !isEmergencyOpen && (
            <button 
              onClick={() => setIsChatOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105"
            >
              <MessageSquare className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>
    </div>
  </HelmetProvider>
  );
}

// --- PAGE COMPONENTS ---

function HomeView({ navigate }) {
  return (
    <div className="animate-in fade-in duration-500">
      <Helmet>
        <title>DMVPipe - Honest Residential Plumbing in DMV Area</title>
        <meta name="description" content="Family-owned residential plumbing services in Northern Virginia. Ganaa provides honest, reliable plumbing repairs and installations for homes in Arlington, Fairfax, and surrounding areas." />
        <meta name="keywords" content="plumber DMV, residential plumbing Virginia, water heater repair, pipe repair, drain cleaning, plumbing emergency" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "DMVPipe",
            "description": "Family-owned residential plumbing services in Northern Virginia",
            "url": "https://dmvpipe.com",
            "telephone": "703-655-6351",
            "address": {
              "@type": "PostalAddress",
              "addressRegion": "VA",
              "addressCountry": "US"
            },
            "geo": {
              "@type": "GeoCoordinates",
              "latitude": 38.8951,
              "longitude": -77.0369
            },
            "openingHours": "Mo-Su",
            "priceRange": "$$",
            "image": "https://dmvpipe.com/logo.png"
          })}
        </script>
      </Helmet>
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-stone-50 to-amber-50/60">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 bg-white text-blue-800 px-4 py-1.5 rounded-full text-sm font-bold mb-6 border border-blue-100 shadow-sm">
              <Home className="w-4 h-4" /> Family Owned & Operated in Northern Virginia
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 text-stone-900 leading-[1.1]">
              Your neighborhood plumber, <span className="text-blue-700">not a call center.</span>
            </h1>
            <p className="text-lg md:text-xl text-stone-600 mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              When you call DMVPipe, you talk to Ganaa — the master plumber who shows up at your door. 15+ years of experience, honest quotes, and homes-only focus.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <a href="tel:7036556351" className="bg-amber-400 hover:bg-amber-300 text-stone-900 px-8 py-4 rounded-full font-extrabold text-lg transition-all shadow-lg shadow-amber-400/30 flex items-center justify-center gap-2">
                <Phone className="w-5 h-5" /> Call Ganaa Now
              </a>
              <button onClick={() => navigate('account')} className="bg-blue-900 hover:bg-blue-800 text-white px-8 py-4 rounded-full font-bold text-lg transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2">
                <Calendar className="w-5 h-5" /> Schedule Online
              </button>
            </div>
            <p className="mt-6 text-sm font-semibold text-stone-500 flex items-center justify-center lg:justify-start gap-2">
              <ShieldCheck className="w-4 h-4 text-green-600" /> VA Class A Contractor · Licensed Master Plumber · Insured · 24/7 Emergency
            </p>
          </div>

          {/* Photo slot: replace the inner div with <img src="/ganaa.jpg" .../> when ready */}
          <div className="relative max-w-md mx-auto w-full">
            <div className="absolute -top-6 -right-6 w-40 h-40 bg-amber-200/50 rounded-full blur-2xl"></div>
            <div className="absolute -bottom-8 -left-8 w-48 h-48 bg-blue-200/50 rounded-full blur-2xl"></div>
            <div className="relative bg-white rounded-3xl shadow-xl border border-stone-100 p-3">
              <div className="aspect-[4/5] rounded-2xl bg-gradient-to-br from-blue-800 to-blue-950 flex flex-col items-center justify-center text-white overflow-hidden relative">
                <Wrench className="absolute -right-8 -bottom-8 w-48 h-48 text-white/5 rotate-12" />
                <img src="/logo-mark.png" alt="DMVPipe" className="h-24 w-24 rounded-full mb-5 drop-shadow-lg ring-2 ring-white/20" />
                <p className="font-extrabold text-2xl tracking-tight">Ganaa</p>
                <p className="text-blue-200 text-sm font-semibold mt-1">Licensed Master Plumber · Owner</p>
                <p className="text-amber-300 text-xs font-bold mt-2 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5"/> VA Class A Contractor</p>
              </div>
              <div className="flex items-center justify-between px-3 py-4">
                <div>
                  <p className="font-bold text-stone-900 text-sm">15+ years fixing NoVA homes</p>
                  <p className="text-xs text-stone-500 mt-0.5">Direct line, no dispatchers</p>
                </div>
                <a href="tel:7036556351" className="bg-blue-50 text-blue-800 p-3 rounded-full hover:bg-blue-100 transition-colors" aria-label="Call now">
                  <Phone className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white border-b border-stone-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <div className="bg-blue-50 text-blue-700 p-3 rounded-2xl"><Clock className="w-6 h-6"/></div>
              <h3 className="font-bold text-stone-900">15+ Years Exp.</h3>
              <p className="text-xs text-stone-500">Master level knowledge</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="bg-green-50 text-green-700 p-3 rounded-2xl"><ShieldCheck className="w-6 h-6"/></div>
              <h3 className="font-bold text-stone-900">Class A Contractor</h3>
              <p className="text-xs text-stone-500">Licensed master plumber & insured</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="bg-amber-50 text-amber-600 p-3 rounded-2xl"><Home className="w-6 h-6"/></div>
              <h3 className="font-bold text-stone-900">100% Residential</h3>
              <p className="text-xs text-stone-500">We specialize in homes</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="bg-blue-50 text-blue-700 p-3 rounded-2xl"><User className="w-6 h-6"/></div>
              <h3 className="font-bold text-stone-900">Family Owned</h3>
              <p className="text-xs text-stone-500">Treating you like family</p>
            </div>
          </div>
        </div>
      </section>

      {/* Services preview */}
      <section className="py-20 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-stone-900 mb-4">What we fix</h2>
            <p className="text-lg text-stone-600">If it involves water, pipes, or gas lines in your home — Ganaa has seen it and fixed it.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {SERVICES.map((s, i) => (
              <button key={i} onClick={() => navigate('services')} className="bg-white p-7 rounded-2xl border border-stone-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left">
                <div className="bg-blue-50 w-14 h-14 rounded-xl flex items-center justify-center mb-5">{s.icon}</div>
                <h3 className="text-lg font-bold text-stone-900 mb-2">{s.title}</h3>
                <p className="text-stone-500 text-sm leading-relaxed">{s.desc}</p>
              </button>
            ))}
          </div>
          <div className="text-center mt-10">
            <button onClick={() => navigate('services')} className="text-blue-700 font-bold hover:underline">See all residential services &rarr;</button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold text-stone-900 mb-4">Simple, honest process</h2>
            <p className="text-lg text-stone-600">No sales pressure, no surprise fees. Here's how it works.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-14 h-14 bg-amber-400 text-stone-900 rounded-2xl flex items-center justify-center mx-auto mb-5 font-extrabold text-xl shadow-md shadow-amber-400/30">1</div>
              <h3 className="font-bold text-stone-900 text-lg mb-2">Call or book online</h3>
              <p className="text-stone-500 text-sm leading-relaxed">Describe the problem. Ganaa answers directly — even for emergencies at odd hours.</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 bg-blue-700 text-white rounded-2xl flex items-center justify-center mx-auto mb-5 font-extrabold text-xl shadow-md shadow-blue-700/30">2</div>
              <h3 className="font-bold text-stone-900 text-lg mb-2">Get an honest quote</h3>
              <p className="text-stone-500 text-sm leading-relaxed">Clear diagnosis and a fair, upfront price before any work begins. No hidden fees.</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 bg-green-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-5 font-extrabold text-xl shadow-md shadow-green-600/30">3</div>
              <h3 className="font-bold text-stone-900 text-lg mb-2">Fixed right, left clean</h3>
              <p className="text-stone-500 text-sm leading-relaxed">Shoe covers on, floors protected, and the workspace left spotless. Guaranteed work.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col lg:flex-row border border-stone-100">
            <div className="lg:w-1/2 p-10 md:p-16 flex flex-col justify-center bg-gradient-to-br from-blue-800 to-blue-950 text-white relative overflow-hidden">
               <MapPin className="absolute -right-10 -bottom-10 w-64 h-64 text-white opacity-5" />
               <div className="relative z-10">
                <h2 className="text-3xl font-extrabold mb-4">Our Service Area</h2>
                <p className="text-blue-100/90 mb-8 leading-relaxed">We proudly serve 20 cities and counties in Northern Virginia, providing rapid response to communities closest to Washington D.C.</p>
                <div className="flex flex-wrap gap-2">
                  {VA_CITIES.slice(0, 8).map(city => {
                    const cityUrl = city.toLowerCase().replace(/\s+/g, '-');
                    return (
                      <button onClick={() => navigate(cityUrl)} key={city} className="bg-white/10 px-3 py-1 rounded-full text-sm font-medium border border-white/10 hover:bg-white/20 transition-colors cursor-pointer">{city}</button>
                    )
                  })}
                  <span className="bg-amber-400 text-stone-900 px-3 py-1 rounded-full text-sm font-bold">...and 12 more!</span>
                </div>
               </div>
            </div>
            <div className="lg:w-1/2 p-10 md:p-16 flex flex-col justify-center">
              <h2 className="text-3xl font-extrabold text-stone-900 mb-6">Why Choose Ganaa?</h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="mt-1"><CheckCircle className="w-6 h-6 text-green-600" /></div>
                  <div>
                    <h4 className="font-bold text-stone-900 text-lg">Direct Communication</h4>
                    <p className="text-stone-600">You deal directly with the owner and master plumber, not a dispatcher or salesman.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="mt-1"><CheckCircle className="w-6 h-6 text-green-600" /></div>
                  <div>
                    <h4 className="font-bold text-stone-900 text-lg">Transparent Pricing</h4>
                    <p className="text-stone-600">No hidden fees. We diagnose the issue and provide a clear quote before any work begins.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="mt-1"><CheckCircle className="w-6 h-6 text-green-600" /></div>
                  <div>
                    <h4 className="font-bold text-stone-900 text-lg">Clean & Respectful</h4>
                    <p className="text-stone-600">Because we only do residential, we know how to protect your home's floors and leave the workspace spotless.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA band */}
      <section className="bg-blue-900 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">Plumbing problem? Talk to Ganaa today.</h2>
          <p className="text-blue-100/90 text-lg mb-8">Honest advice on the phone, fair quotes at your door, and emergency help when you need it most.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="tel:7036556351" className="bg-amber-400 hover:bg-amber-300 text-stone-900 px-8 py-4 rounded-full font-extrabold text-lg transition-all shadow-lg flex items-center justify-center gap-2">
              <Phone className="w-5 h-5" /> 703-655-6351
            </a>
            <button onClick={() => navigate('contact')} className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-8 py-4 rounded-full font-bold text-lg transition-all flex items-center justify-center gap-2">
              <Send className="w-5 h-5" /> Send a Message
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function NotFoundView({ navigate }) {
  return (
    <div className="py-24 text-center px-4">
      <h1 className="text-5xl font-extrabold text-slate-900 mb-4">404</h1>
      <h2 className="text-2xl font-bold text-slate-700 mb-6">Page Not Found</h2>
      <p className="text-slate-500 mb-8 max-w-md mx-auto">The page you're looking for doesn't exist. But if your plumbing has a problem, we can definitely fix that.</p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button onClick={() => navigate('home')} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full font-bold transition-colors">Back to Home</button>
        <button onClick={() => navigate('services')} className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-8 py-3 rounded-full font-bold transition-colors">View Services</button>
      </div>
    </div>
  );
}

function CityView({ navigate, city }) {
  const citySlug = city.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="animate-in fade-in duration-500">
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Plumber",
            "name": "DMVPipe - Ganaa's Plumbing",
            "url": `https://dmvpipe.com/${citySlug}`,
            "telephone": "+1-703-655-6351",
            "image": "https://dmvpipe.com/logo.png",
            "priceRange": "$$",
            "areaServed": { "@type": "City", "name": `${city}, VA` },
            "parentOrganization": { "@id": "https://dmvpipe.com/#business" }
          })}
        </script>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://dmvpipe.com/" },
              { "@type": "ListItem", "position": 2, "name": `Plumber in ${city}, VA`, "item": `https://dmvpipe.com/${citySlug}` }
            ]
          })}
        </script>
      </Helmet>
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-stone-50 to-amber-50/60">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 flex flex-col items-center text-center">
          <span className="bg-white text-blue-800 px-4 py-1.5 rounded-full text-sm font-bold mb-6 border border-blue-100 shadow-sm flex items-center gap-2">
            <MapPin className="w-4 h-4"/> Local Plumber in {city}, VA
          </span>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 max-w-4xl text-stone-900 leading-[1.1]">
            Honest Residential Plumbing for <span className="text-blue-700">{city}</span> Homes
          </h1>
          <p className="text-lg md:text-xl text-stone-600 mb-10 max-w-2xl leading-relaxed">
            Ganaa provides master-level plumbing services strictly for residential homes in {city} and the greater DMV area. Leak repairs, water heaters, and drain cleaning done right.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="tel:7036556351" className="bg-amber-400 hover:bg-amber-300 text-stone-900 px-8 py-4 rounded-full font-extrabold text-lg transition-all shadow-lg shadow-amber-400/30 flex items-center justify-center gap-2">
              <Phone className="w-5 h-5" /> Call Ganaa Now
            </a>
            <button onClick={() => navigate('account')} className="bg-blue-900 hover:bg-blue-800 text-white px-8 py-4 rounded-full font-bold text-lg transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2">
              <Calendar className="w-5 h-5" /> Book a {city} Appointment
            </button>
          </div>
          <p className="mt-6 text-sm font-semibold text-stone-500 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-green-600" /> VA Class A Contractor · Licensed Master Plumber · 24/7 Emergency
          </p>
        </div>
      </section>

      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
         <h2 className="text-3xl font-extrabold text-stone-900 mb-6">Why {city} Homeowners Trust DMVPipe</h2>
         <p className="text-lg text-stone-600 max-w-3xl mx-auto leading-relaxed">
           When you need a reliable plumber in {city}, Virginia, you shouldn't have to deal with giant corporate dispatch centers. Ganaa brings 15+ years of direct, hands-on master plumbing experience right to your front door.
         </p>
         <button onClick={() => navigate('services')} className="mt-8 text-blue-700 font-bold hover:underline">View All Residential Services &rarr;</button>
      </section>
    </div>
  );
}

// Shows a real photo if /public/products/photos/<id>.jpg exists,
// otherwise falls back to the illustration. To add real photos: drop files
// named by product id (e.g. wh-gas-40.jpg) into public/products/photos/.
function ProductImage({ p }) {
  const [src, setSrc] = useState(`/products/photos/${p.id}.jpg`);
  if (!src) {
    return <div className="w-full h-full flex items-center justify-center text-blue-200">{CATEGORY_ICONS[p.cat] || <Wrench className="w-8 h-8" />}</div>;
  }
  return (
    <img
      src={src}
      alt={p.name}
      className="w-full h-full object-contain p-2"
      loading="lazy"
      onError={() => setSrc(src === p.img ? null : p.img)}
    />
  );
}

function ShopView({ navigate, cart, updateCart }) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const visible = q ? PRODUCTS.filter(p => p.name.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q)) : PRODUCTS;
  const categories = [...new Set(visible.map(p => p.cat))];
  const cartItems = PRODUCTS.filter(p => cart[p.id]);
  const total = cartItems.reduce((sum, p) => sum + p.price * cart[p.id], 0);

  return (
    <div className="animate-in fade-in duration-500 py-12 md:py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32 lg:pb-16">
      {/* Mobile floating cart bar */}
      {cartItems.length > 0 && (
        <div className="lg:hidden fixed bottom-24 left-3 right-3 z-40">
          <button
            onClick={() => navigate('account')}
            className="w-full bg-blue-900 text-white rounded-2xl shadow-2xl shadow-blue-900/30 px-5 py-4 flex items-center justify-between active:bg-blue-950"
          >
            <span className="flex items-center gap-3 font-bold">
              <span className="relative">
                <ShoppingCart className="w-6 h-6" />
                <span className="absolute -top-2 -right-2 bg-amber-400 text-stone-900 text-[10px] font-extrabold rounded-full w-5 h-5 flex items-center justify-center">{cartItems.reduce((a, p) => a + cart[p.id], 0)}</span>
              </span>
              ${total} in materials
            </span>
            <span className="bg-amber-400 text-stone-900 font-extrabold text-sm px-4 py-2 rounded-full">Book Now &rarr;</span>
          </button>
        </div>
      )}
      <div className="text-center max-w-3xl mx-auto mb-12">
        <span className="inline-flex items-center gap-2 bg-blue-50 text-blue-800 px-4 py-1.5 rounded-full text-sm font-bold mb-5 border border-blue-100">
          <ShoppingCart className="w-4 h-4" /> Materials Shop
        </span>
        <h1 className="text-4xl font-extrabold text-stone-900 mb-4">Quality materials, Home Depot prices</h1>
        <p className="text-lg text-stone-600 leading-relaxed">Order the parts with your service and Ganaa brings them to the job — professionally installed, one bill for everything at the end. No store runs, no markup games.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8 items-start">
        {/* Catalog */}
        <div className="lg:col-span-2 space-y-10">
          {/* Sticky search + category menu (stays visible while scrolling) */}
          <div className="sticky top-20 z-30 bg-[#fafaf9] pt-2 pb-3 border-b border-stone-200">
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search materials… e.g. water heater, wax ring, faucet"
                className="w-full bg-white border border-stone-200 rounded-full pl-11 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none shadow-sm"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map(cat => (
                <a key={cat} href={`#cat-${cat.replace(/[^a-z]/gi, '-')}`} className="whitespace-nowrap shrink-0 bg-white border border-stone-200 hover:border-blue-400 hover:text-blue-700 text-stone-700 text-xs font-bold px-3.5 py-2 rounded-full transition-colors shadow-sm">
                  {cat}
                </a>
              ))}
            </div>
          </div>
          {visible.length === 0 && (
            <div className="text-center py-12 bg-white rounded-2xl border border-stone-100">
              <p className="font-bold text-stone-800 mb-2">No items match "{search}"</p>
              <p className="text-sm text-stone-500">Ganaa can source any residential plumbing part at store price — <button onClick={() => navigate('contact')} className="text-blue-700 underline">send us a message</button>.</p>
            </div>
          )}
          {categories.map(cat => (
            <div key={cat} id={`cat-${cat.replace(/[^a-z]/gi, '-')}`} className="scroll-mt-52">
              <h2 className="text-xl font-extrabold text-stone-900 mb-4">{cat}</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {visible.filter(p => p.cat === cat).map(p => (
                  <div key={p.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-3 sm:p-4 flex flex-row sm:flex-col gap-4 sm:gap-0">
                    <div className="w-36 h-36 shrink-0 sm:w-full sm:h-32 rounded-xl sm:mb-4 overflow-hidden bg-gradient-to-br from-blue-50 to-stone-100">
                      <ProductImage p={p} />
                    </div>
                    <div className="flex flex-col grow min-w-0">
                      <h3 className="font-bold text-stone-900 text-sm leading-snug">{p.name}</h3>
                      <p className="font-extrabold text-blue-800 text-xl sm:text-lg mt-1">${p.price}<span className="text-xs text-stone-400 font-semibold"> /{p.unit}</span></p>
                      <div className="mt-auto pt-2">
                        {cart[p.id] ? (
                          <div className="inline-flex items-center gap-1 bg-blue-50 border border-blue-100 rounded-full px-1.5 py-1">
                            <button onClick={() => updateCart(p.id, -1)} aria-label="Remove one" className="p-2 rounded-full hover:bg-blue-100 active:bg-blue-200 text-blue-800"><Minus className="w-4 h-4"/></button>
                            <span className="font-extrabold text-blue-900 text-base min-w-[1.5rem] text-center">{cart[p.id]}</span>
                            <button onClick={() => updateCart(p.id, 1)} aria-label="Add one" className="p-2 rounded-full hover:bg-blue-100 active:bg-blue-200 text-blue-800"><Plus className="w-4 h-4"/></button>
                          </div>
                        ) : (
                          <button onClick={() => updateCart(p.id, 1)} className="inline-flex items-center gap-1.5 bg-blue-900 hover:bg-blue-800 active:bg-blue-950 text-white text-sm font-bold px-6 py-2.5 rounded-full transition-colors">
                            <Plus className="w-4 h-4"/> Add
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-stone-400 leading-relaxed">Don't see the part you need? Ganaa sources any residential plumbing material at store price — just mention it when booking or <button onClick={() => navigate('contact')} className="underline hover:text-stone-600">send us a message</button>.</p>
        </div>

        {/* Cart summary */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-lg p-6 lg:sticky lg:top-24">
          <h2 className="font-extrabold text-stone-900 text-lg mb-4 flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-blue-700"/> Your Materials</h2>
          {cartItems.length === 0 ? (
            <p className="text-sm text-stone-500 leading-relaxed">Nothing added yet. Pick the materials you need — they'll be attached to your service booking.</p>
          ) : (
            <>
              <ul className="divide-y divide-stone-100 mb-4">
                {cartItems.map(p => (
                  <li key={p.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{p.name}</p>
                      <p className="text-xs text-stone-400">${p.price} × {cart[p.id]}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="font-bold text-stone-900 text-sm">${p.price * cart[p.id]}</p>
                      <button onClick={() => updateCart(p.id, -cart[p.id])} aria-label="Remove item" className="text-stone-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between font-extrabold text-stone-900 text-lg border-t border-stone-200 pt-4 mb-5">
                <span>Materials total</span><span>${total}</span>
              </div>
              <button onClick={() => navigate('account')} className="w-full bg-amber-400 hover:bg-amber-300 text-stone-900 font-extrabold py-3.5 rounded-full transition-colors flex items-center justify-center gap-2">
                <Calendar className="w-5 h-5"/> Book Service with Materials
              </button>
              <p className="text-xs text-stone-400 mt-3 text-center leading-relaxed">Pay for service + materials together when the job is done — card, cash, or Zelle. Ganaa confirms availability and final pricing.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ServicesView({ navigate }) {
  return (
    <div className="animate-in fade-in duration-500 py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h2 className="text-4xl font-extrabold text-stone-900 mb-4">Residential Services</h2>
        <p className="text-lg text-stone-600">Ganaa specializes exclusively in residential plumbing. By not taking commercial jobs, we ensure we have the time and specialized focus to treat your home with the utmost care.</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
        {SERVICES.map((s, i) => (
          <div key={i} className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100 hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
              {s.icon}
            </div>
            <h3 className="text-xl font-bold text-stone-900 mb-3">{s.title}</h3>
            <p className="text-stone-600 text-sm leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-20 bg-gradient-to-br from-blue-800 to-blue-950 rounded-3xl p-8 md:p-12 text-center text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-2xl md:text-3xl font-extrabold mb-4">Have a unique plumbing issue?</h3>
          <p className="text-blue-100 mb-8 max-w-2xl mx-auto">If it involves pipes, water, or gas lines in a residential home, Ganaa has seen it and fixed it. Call or message us for a custom assessment.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="tel:7036556351" className="bg-amber-400 hover:bg-amber-300 text-stone-900 px-8 py-3 rounded-full font-extrabold shadow-lg transition-colors flex items-center justify-center gap-2">
              <Phone className="w-5 h-5" /> 703-655-6351
            </a>
            <button onClick={() => navigate('contact')} className="bg-white/10 hover:bg-white/20 border border-white/20 text-white px-8 py-3 rounded-full font-bold shadow-lg transition-colors">
              Contact Us Now
            </button>
          </div>
        </div>
        <Wrench className="absolute -left-10 -bottom-10 w-64 h-64 text-white opacity-5 rotate-45" />
      </div>
    </div>
  );
}

function BlogPostView({ navigate, slug }) {
  const post = BLOG_POSTS.find(p => p.slug === slug);

  if (!post) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-2xl font-bold text-slate-900">Article not found</h2>
        <button onClick={() => navigate('blog')} className="text-blue-600 mt-4 hover:underline">Return to Blog Hub</button>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 bg-white min-h-screen pb-20">
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": post.title,
            "description": post.excerpt,
            "datePublished": new Date(post.date).toISOString().split('T')[0],
            "url": `https://dmvpipe.com/post-${post.slug}`,
            "author": { "@type": "Organization", "name": "DMVPipe" },
            "publisher": {
              "@type": "Organization",
              "name": "DMVPipe",
              "logo": { "@type": "ImageObject", "url": "https://dmvpipe.com/logo.png" }
            }
          })}
        </script>
      </Helmet>
      <div className="bg-slate-900 pt-16 pb-32 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <button onClick={() => navigate('blog')} className="text-blue-400 font-medium text-sm flex items-center justify-center gap-1 mx-auto mb-6 hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4"/> Back to Blog
          </button>
          <span className="text-slate-400 text-sm font-semibold tracking-wider uppercase">{post.date}</span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white mt-4 leading-tight">{post.title}</h1>
        </div>
      </div>
      
      <div className="max-w-3xl mx-auto px-4 sm:px-6 -mt-16 relative z-10">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 md:p-12 text-slate-700 leading-relaxed text-lg">
          {post.content}
        </div>
        
        <div className="mt-12 bg-blue-50 rounded-2xl p-8 text-center border border-blue-100">
          <h3 className="text-xl font-bold text-blue-900 mb-2">Need a residential plumber?</h3>
          <p className="text-blue-800 mb-6">Ganaa is ready to help you with any plumbing needs in the DMV area.</p>
          <button onClick={() => navigate('account')} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full shadow-md transition-colors">
            Schedule Service Now
          </button>
        </div>
      </div>
    </div>
  );
}

function BlogHubView({ navigate }) {
  return (
    <div className="animate-in fade-in duration-500 py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-12 text-center md:text-left">
        <h2 className="text-4xl font-extrabold text-stone-900 mb-4">Homeowner Advice Hub</h2>
        <p className="text-lg text-stone-600 max-w-2xl">Tips and tricks from 15+ years in the field to help you prevent emergencies and maintain your home's plumbing.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {BLOG_POSTS.map(post => (
          <article key={post.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col hover:shadow-lg transition-shadow">
            <div className="h-48 bg-slate-200 relative overflow-hidden cursor-pointer" onClick={() => navigate(`post-${post.slug}`)}>
               <div className="absolute inset-0 bg-linear-to-tr from-slate-800 to-slate-600 opacity-90"></div>
               <FileText className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 text-white/50" />
            </div>
            <div className="p-6 grow flex flex-col">
              <span className="text-sm font-semibold text-blue-600 mb-2">{post.date}</span>
              <h3 className="text-xl font-bold text-slate-900 mb-3 line-clamp-2 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => navigate(`post-${post.slug}`)}>
                {post.title}
              </h3>
              <p className="text-slate-600 text-sm mb-6 grow">{post.excerpt}</p>
              
              <button 
                onClick={() => navigate(`post-${post.slug}`)} 
                className="text-slate-900 font-bold text-sm hover:text-blue-600 transition-colors flex items-center gap-1 w-max"
              >
                Read Article <span className="text-lg leading-none">&rarr;</span>
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ContactView({ user }) {
  const [status, setStatus] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    const form = e.target;
    const formData = new FormData(form);
    const data = {
      serviceType: 'Contact Form Message',
      customerName: formData.get('name'),
      phone: formData.get('phone'),
      address: formData.get('city') ? `${formData.get('city')}, VA` : 'Not provided',
      notes: `Message: ${formData.get('message')}. Contact Phone: ${formData.get('phone')}`,
      date: new Date().toISOString().split('T')[0],
      time: 'N/A',
      status: 'pending',
      createdAt: serverTimestamp()
    };
    try {
      notifyGanaa('📩 New contact message — DMVPipe', {
        Name: data.customerName, Phone: data.phone, City: data.address, Message: formData.get('message')
      });
      if (db) {
        const currentUserId = (user && !user.isAnonymous) ? user.uid : 'simulated_user_123';
        const leadsRef = collection(db, 'artifacts', appId, 'users', currentUserId, 'appointments');
        await addDoc(leadsRef, data);
      }
      setStatus('sent');
      form.reset();
      setTimeout(() => setStatus(''), 5000);
    } catch (err) {
      console.error("Contact form error:", err);
      setStatus('error');
    }
  };

  return (
    <div className="animate-in fade-in duration-500 py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col lg:flex-row border border-slate-100">
        <div className="lg:w-1/3 bg-gradient-to-br from-blue-800 to-blue-950 text-white p-10 flex flex-col">
          <h2 className="text-3xl font-extrabold mb-8">Get in Touch</h2>
          <div className="space-y-8 grow">
            <div>
              <h4 className="text-amber-300 font-semibold mb-2 flex items-center gap-2"><Phone className="w-5 h-5"/> Phone</h4>
              <p className="text-lg"><a href="tel:7036556351" className="font-bold hover:underline">703-655-6351</a></p>
              <p className="text-sm text-blue-200/70 mt-1">Available for emergency calls</p>
            </div>
            <div>
              <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2"><Mail className="w-5 h-5"/> Email</h4>
              <p className="text-lg">info@dmvpipe.com</p>
            </div>
            <div>
              <h4 className="text-amber-300 font-semibold mb-2 flex items-center gap-2"><MapPin className="w-5 h-5"/> Service Area</h4>
              <p className="leading-relaxed text-blue-100/80">Serving Alexandria, Arlington, Fairfax, and 17 other nearby VA cities.</p>
            </div>
            <div>
              <h4 className="text-amber-300 font-semibold mb-2 flex items-center gap-2"><ShieldCheck className="w-5 h-5"/> Credentials</h4>
              <p className="leading-relaxed text-blue-100/80">Virginia Class A Contractor. Licensed Master Plumber with 15+ years of experience. Fully insured.</p>
            </div>
          </div>
        </div>
        
        <div className="lg:w-2/3 p-10 md:p-14">
          <h3 className="text-2xl font-bold text-slate-900 mb-6">Send us a message</h3>
          {status === 'sent' && (
            <div className="mb-6 bg-green-50 text-green-700 p-4 rounded-lg flex items-center gap-3">
              <CheckCircle className="w-5 h-5" /> Message sent successfully! We will reply shortly.
            </div>
          )}
          {status === 'error' && (
            <div className="mb-6 bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-3">
              <AlertTriangle className="w-5 h-5" /> Something went wrong. Please call us directly at 703-655-6351.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Name</label>
                <input required name="name" type="text" autoComplete="name" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Phone</label>
                <input required name="phone" type="tel" inputMode="tel" autoComplete="tel" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" placeholder="703-555-1234" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">City in VA</label>
              <select required name="city" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
                <option value="">Select your city...</option>
                {VA_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">How can we help?</label>
              <textarea required name="message" rows="4" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" placeholder="Describe your plumbing issue..."></textarea>
            </div>
            <button disabled={status === 'sending'} type="submit" className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-colors flex items-center gap-2">
              {status === 'sending' ? 'Sending...' : <><Send className="w-4 h-4"/> Send Message</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function AccountView({ user, db, appId, cart = {}, clearCart, navigate }) {
  const [isSimulatedLogin, setIsSimulatedLogin] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [guestSuccess, setGuestSuccess] = useState(false);
  const initialLoadRef = useRef(true);

  const handleGoogleLogin = async (e) => {
    e.preventDefault();
    if (!auth) {
       setIsSimulatedLogin(true);
       return;
    }
    setLoginLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider); 
      const loggedInUser = result.user;
      
      if (db) {
        const userProfileRef = doc(db, 'artifacts', appId, 'users', loggedInUser.uid, 'profile', 'details');
        const docSnap = await getDoc(userProfileRef);
        
        if (!docSnap.exists()) {
          await setDoc(userProfileRef, {
            name: loggedInUser.displayName || 'Valued Customer',
            email: loggedInUser.email || '',
            photoURL: loggedInUser.photoURL || '',
            createdAt: serverTimestamp(),
            marketingOptIn: true 
          });
        }
      }
    } catch (error) {
      console.error("Google Sign-In Error:", error);
      setIsSimulatedLogin(true);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsSimulatedLogin(false);
    if (auth && user && !user.isAnonymous) {
      await signOut(auth);
    }
  };

  useEffect(() => {
    if ((!user || user.isAnonymous) && !isSimulatedLogin) return;
    if (!db) return;

    const currentUserId = (user && !user.isAnonymous) ? user.uid : 'simulated_user_123';
    const appointmentsRef = collection(db, 'artifacts', appId, 'users', currentUserId, 'appointments');
    const q = query(appointmentsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const apps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAppointments(apps);
        if (initialLoadRef.current) {
          initialLoadRef.current = false;
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching appointments:", error);
        if (initialLoadRef.current) {
          initialLoadRef.current = false;
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, isSimulatedLogin, db, appId]);

  if (!isSimulatedLogin && (!user || user.isAnonymous)) {
    return (
      <div className="animate-in fade-in py-10 md:py-16 px-4 max-w-2xl mx-auto">
        {guestSuccess ? (
          <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl border border-stone-100 text-center">
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-extrabold text-stone-900 mb-3">Request received!</h2>
            <p className="text-stone-600 mb-8 leading-relaxed">Ganaa personally reviews every booking and will call or text you shortly to confirm — usually within the hour during the day.</p>
            <a href="tel:7036556351" className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-stone-900 px-8 py-3 rounded-full font-extrabold transition-colors">
              <Phone className="w-5 h-5" /> Need it faster? Call now
            </a>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h2 className="text-3xl md:text-4xl font-extrabold text-stone-900 mb-3">Book a Service</h2>
              <p className="text-stone-600">No account needed — tell us what you need and Ganaa will confirm with you personally.</p>
            </div>
            <div className="bg-white p-6 md:p-10 rounded-3xl shadow-xl border border-stone-100">
              <SchedulingForm
                db={db} user={user} appId={appId} userName="Guest"
                guest={true} cart={cart} clearCart={clearCart} navigate={navigate}
                onSuccess={() => setGuestSuccess(true)}
              />
            </div>
            <div className="mt-8 bg-stone-100/70 rounded-2xl p-6 text-center">
              <p className="text-sm text-stone-600 mb-4 font-medium">Been here before? Sign in to see your service history.</p>
              <button
                onClick={handleGoogleLogin}
                disabled={loginLoading}
                className="inline-flex bg-white border-2 border-stone-200 hover:border-blue-500 hover:bg-stone-50 disabled:opacity-60 text-stone-800 font-bold py-3 px-6 rounded-xl transition-all shadow-sm items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {loginLoading ? 'Opening Google…' : 'Sign in with Google'}
              </button>
              <p className="text-xs text-stone-400 mt-3">Optional — only needed to view past appointments.</p>
            </div>
          </>
        )}
      </div>
    );
  }

  const isRealUser = user && !user.isAnonymous;
  const userName = isRealUser && user.displayName ? user.displayName : "Valued Customer";
  const firstName = userName.split(' ')[0];
  const userPhoto = isRealUser && user.photoURL ? user.photoURL : null;
  const userEmail = isRealUser && user.email ? user.email : "Not provided";

  return (
    <div className="animate-in fade-in py-12 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-6">
          {userPhoto ? (
            <img src={userPhoto} alt={userName} className="w-20 h-20 rounded-full shadow-md border-4 border-white" />
          ) : (
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center shadow-inner">
              <User className="w-10 h-10 text-blue-600" />
            </div>
          )}
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Welcome back, {firstName}!</h2>
            <p className="text-slate-500 mt-1 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /> DMVPipe Preferred Customer
            </p>
          </div>
        </div>
        <button onClick={handleLogout} className="mt-6 md:mt-0 flex items-center gap-2 text-slate-500 hover:text-red-600 font-medium px-4 py-2 rounded-lg hover:bg-red-50 transition-colors">
          <LogOut className="w-4 h-4"/> Sign Out
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <button 
            onClick={() => setShowScheduleForm(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] flex items-center justify-center gap-2 text-lg"
          >
            <Calendar className="w-6 h-6" /> Book Service Now
          </button>
          
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-blue-500"/> Your Profile</h4>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Full Name</p>
                <p className="text-slate-800 font-medium">{userName}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Email (For Confirmations)</p>
                <p className="text-slate-800 font-medium truncate">{userEmail}</p>
              </div>
            </div>
            <p className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-400 leading-relaxed">
              We use this information to send appointment confirmations and occasional home maintenance tips.
            </p>
          </div>
        </div>

        <div className="md:col-span-2">
          {showScheduleForm ? (
            <div className="bg-white p-6 md:p-8 rounded-2xl border-2 border-blue-500 shadow-xl relative animate-in slide-in-from-right-4">
              <button onClick={() => setShowScheduleForm(false)} className="absolute top-6 right-6 bg-slate-100 hover:bg-slate-200 p-2 rounded-full text-slate-600 transition-colors"><X className="w-5 h-5"/></button>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Schedule an Appointment</h3>
              <p className="text-slate-500 mb-8">Tell us what you need. Ganaa will review it shortly.</p>
              <SchedulingForm
                db={db} user={user} appId={appId} userName={userName}
                cart={cart} clearCart={clearCart} navigate={navigate}
                onSuccess={() => setShowScheduleForm(false)}
              />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-xl text-slate-900 flex items-center gap-2"><Clock className="w-6 h-6 text-blue-500"/> Service History</h3>
                <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full">{appointments.length} Records</span>
              </div>
              
              <div className="p-0">
                {loading ? (
                  <p className="p-12 text-center text-slate-500 animate-pulse">Loading your history...</p>
                ) : appointments.length === 0 ? (
                  <div className="p-16 text-center flex flex-col items-center">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                      <Wrench className="w-10 h-10 text-slate-300" />
                    </div>
                    <h4 className="text-lg font-bold text-slate-800 mb-2">No past appointments</h4>
                    <p className="text-slate-500 mb-6 max-w-sm">When you schedule a service with Ganaa, it will appear here for your records.</p>
                    <button onClick={() => setShowScheduleForm(true)} className="text-blue-600 font-bold hover:underline bg-blue-50 px-6 py-2 rounded-full">Book your first service</button>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {appointments.map(app => (
                      <li key={app.id} className="p-6 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                        <div>
                          <p className="font-bold text-lg text-slate-900">{app.serviceType}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <p className="text-sm font-medium text-blue-600 flex items-center gap-1"><Calendar className="w-4 h-4"/> {new Date(app.date).toLocaleDateString()}</p>
                            <p className="text-sm text-slate-500 flex items-center gap-1"><Clock className="w-4 h-4"/> {app.time}</p>
                          </div>
                          <p className="text-sm text-slate-500 mt-2 flex items-center gap-1 truncate max-w-sm"><MapPin className="w-4 h-4"/> {app.address}</p>
                        </div>
                        <span className={`px-4 py-2 rounded-xl text-xs font-bold self-start sm:self-auto uppercase tracking-wider border
                          ${app.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 
                            app.status === 'urgent' ? 'bg-red-50 text-red-700 border-red-200' : 
                            'bg-green-50 text-green-700 border-green-200'}`}>
                          {app.status || 'PENDING'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SchedulingForm({ db, user, appId, userName, onSuccess, guest = false, cart = {}, clearCart, navigate }) {
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState([]);
  const cartItems = PRODUCTS.filter(p => cart[p.id]);
  const materialsTotal = cartItems.reduce((sum, p) => sum + p.price * cart[p.id], 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!db) return;

    setSubmitting(true);
    const formData = new FormData(e.target);
    const customerName = guest ? formData.get('name') : userName;
    const phone = formData.get('phone') || (user && user.phoneNumber) || 'Not provided';
    const photoUrls = await uploadLeadPhotos(photos);
    const materialsText = cartItems.length
      ? cartItems.map(p => `${p.name} × ${cart[p.id]} ($${p.price * cart[p.id]})`).join('; ') + ` — Materials total: $${materialsTotal}`
      : '';
    const data = {
      photos: photoUrls,
      serviceType: formData.get('serviceType'),
      date: formData.get('date'),
      time: formData.get('time'),
      address: formData.get('address'),
      notes: `${formData.get('notes') || ''}${phone !== 'Not provided' ? ` | Phone: ${phone}` : ''}${materialsText ? ` | MATERIALS: ${materialsText}` : ''}`,
      customerName,
      materials: cartItems.map(p => ({ id: p.id, name: p.name, qty: cart[p.id], price: p.price })),
      materialsTotal,
      status: 'pending',
      createdAt: serverTimestamp()
    };
    notifyGanaa(`📅 New service booking${cartItems.length ? ' + MATERIALS ORDER' : ''} — DMVPipe`, {
      Service: data.serviceType, Date: data.date, Time: data.time,
      Name: customerName, Phone: phone, Address: data.address,
      Notes: formData.get('notes') || '—',
      Materials: materialsText || 'None',
      'Situation photos': photoUrls.length ? photoUrls.join('  |  ') : 'None'
    });

    try {
      const currentUserId = (user && !user.isAnonymous) ? user.uid : 'simulated_user_123';
      const appointmentsRef = collection(db, 'artifacts', appId, 'users', currentUserId, 'appointments');
      await addDoc(appointmentsRef, data);

      if (cartItems.length && clearCart) clearCart();
      setTimeout(() => {
        setSubmitting(false);
        onSuccess();
      }, 800);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {guest && (
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Your Name</label>
            <input required name="name" type="text" autoComplete="name" placeholder="John Doe" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Phone Number</label>
            <input required name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="703-555-1234" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
          </div>
        </div>
      )}
       <div className="grid grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Date Needed</label>
          <input required name="date" type="date" min={new Date().toISOString().split('T')[0]} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Time Preference</label>
          <select required name="time" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all">
            <option value="Morning (8am-12pm)">Morning (8am-12pm)</option>
            <option value="Afternoon (12pm-4pm)">Afternoon (12pm-4pm)</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-bold text-slate-700 mb-2">Service Needed</label>
        <select required name="serviceType" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all">
          <option value="General Inspection">General Inspection</option>
          <option value="Leak Repair">Leak Repair</option>
          <option value="Water Heater">Water Heater Issue</option>
          <option value="Clogged Drain">Clogged Drain</option>
          <option value="Other">Other Residential Issue</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-bold text-slate-700 mb-2">Service Address</label>
        <input required name="address" type="text" placeholder="123 Main St, City, VA" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
      </div>
      <div>
        <label className="block text-sm font-bold text-slate-700 mb-2">Notes for Ganaa</label>
        <textarea name="notes" rows="3" placeholder="Please describe the issue in detail..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"></textarea>
      </div>
      <div>
        <label className="block text-sm font-bold text-slate-700 mb-2">Photos of the problem <span className="font-normal text-slate-400">(optional, up to 3)</span></label>
        <PhotoPicker photos={photos} setPhotos={setPhotos} />
        <p className="text-xs text-slate-400 mt-2">Photos help Ganaa bring the right parts on the first visit.</p>
      </div>
      {cartItems.length > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-blue-900 text-sm flex items-center gap-2"><ShoppingCart className="w-4 h-4"/> Materials in this order</h4>
            {navigate && <button type="button" onClick={() => navigate('shop')} className="text-xs font-bold text-blue-700 hover:underline">Edit</button>}
          </div>
          <ul className="text-sm text-blue-900/80 space-y-1">
            {cartItems.map(p => (
              <li key={p.id} className="flex justify-between gap-3">
                <span className="truncate">{p.name} × {cart[p.id]}</span>
                <span className="font-semibold shrink-0">${p.price * cart[p.id]}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between font-extrabold text-blue-950 text-sm border-t border-blue-200 pt-2 mt-2">
            <span>Materials total</span><span>${materialsTotal}</span>
          </p>
          <p className="text-xs text-blue-800/60 mt-2">One bill at the end — service + materials together (card, cash, or Zelle).</p>
        </div>
      )}
      <button disabled={submitting} type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition-colors flex justify-center items-center gap-2 text-lg mt-4">
        {submitting ? 'Processing Request...' : <><CheckCircle className="w-5 h-5"/> {cartItems.length ? `Confirm Booking + Materials ($${materialsTotal})` : 'Confirm Booking'}</>}
      </button>
      <p className="text-sm text-center text-slate-500 mt-2 font-medium">Ganaa personally confirms every request — no automated dispatch.</p>
    </form>
  );
}

function EmergencyForm({ db, user, appId, onClose }) {
  const [step, setStep] = useState(1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!db) return;

    const formData = new FormData(e.target);
    const data = {
      isEmergency: true,
      phone: formData.get('phone'),
      email: formData.get('email'),
      address: formData.get('address'),
      issue: formData.get('issue'),
      status: 'URGENT',
      createdAt: serverTimestamp()
    };

    try {
      notifyGanaa('🚨 EMERGENCY plumbing request — DMVPipe', {
        Priority: 'URGENT', Phone: data.phone, Email: data.email, Address: data.address, Issue: data.issue
      });
      const currentUserId = (user && !user.isAnonymous) ? user.uid : 'simulated_user_123';
      const appointmentsRef = collection(db, 'artifacts', appId, 'users', currentUserId, 'appointments');
      await addDoc(appointmentsRef, data);

      setStep(2);
      setTimeout(() => {
        onClose();
        setStep(1);
      }, 4000);
    } catch (err) {
      console.error(err);
    }
  };

  if (step === 2) {
    return (
      <div className="p-6 text-center">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8" />
        </div>
        <h3 className="font-bold text-lg mb-2">Request Sent!</h3>
        <p className="text-sm text-slate-600 mb-4">Ganaa has been notified via SMS. An automated email confirmation was sent to your email.</p>
        <p className="text-xs text-slate-400">If water is actively leaking, locate your main shut-off valve immediately.</p>
      </div>
    );
  }

  return (
    <div className="p-5 max-h-[80vh] overflow-y-auto">
      <p className="text-sm text-slate-600 mb-4 font-medium">For immediate residential plumbing emergencies in the DMV area.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Your Phone Number</label>
          <input required name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="703-555-1234" className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-red-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
          <input required name="email" type="email" placeholder="you@example.com" className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-red-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Home Address</label>
          <input required name="address" type="text" placeholder="123 Main St, City, VA" className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-red-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">What is the emergency?</label>
          <textarea required name="issue" rows="2" placeholder="e.g. Burst pipe, no hot water..." className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-red-500 outline-none"></textarea>
        </div>
        <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded shadow transition-colors mt-2">
          Send Urgent Request
        </button>
      </form>
    </div>
  );
}


// --- SMART PLUMBING TRIAGE CHATBOT ---
// Scripted flow with plumbing knowledge: identifies the issue, asks the right
// follow-up questions, gives honest safety advice, then captures the lead.

const ISSUE_PATTERNS = [
  { key: 'gas', words: ['gas', 'rotten egg', 'sulfur smell'] },
  { key: 'leak', words: ['leak', 'drip', 'burst', 'flood', 'spraying', 'pipe broke', 'water everywhere', 'ceiling stain', 'wet spot'] },
  { key: 'water_heater', words: ['water heater', 'hot water', 'no hot', 'heater', 'tankless', 'lukewarm', 'cold shower'] },
  { key: 'drain', words: ['drain', 'clog', 'backed up', 'backing up', 'slow sink', 'standing water', 'sewer smell', 'gurgl'] },
  { key: 'toilet', words: ['toilet', 'flush', 'keeps running', 'overflow'] },
  { key: 'sump', words: ['sump', 'basement pump', 'crawl space pump'] },
  { key: 'disposal', words: ['disposal', 'grinding', 'humming'] },
];

const detectIssue = (text) => {
  const t = text.toLowerCase();
  for (const p of ISSUE_PATTERNS) {
    if (p.words.some(w => t.includes(w))) return p.key;
  }
  return null;
};

const ISSUE_LABELS = {
  gas: 'Possible gas issue',
  leak: 'Leak / water damage',
  water_heater: 'Water heater problem',
  drain: 'Clogged or slow drain',
  toilet: 'Toilet problem',
  sump: 'Sump pump issue',
  disposal: 'Garbage disposal issue',
  other: 'General plumbing issue',
};

function ChatbotUI({ user, db, appId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatState, setChatState] = useState('init');
  const [lead, setLead] = useState({ name: '', phone: '', issue: '', issueType: '', details: '', address: '', time: '', urgent: false });
  const [leadPhotoUrls, setLeadPhotoUrls] = useState([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const attachPhotos = async (fileList) => {
    const remaining = 3 - leadPhotoUrls.length;
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/')).slice(0, Math.max(0, remaining));
    if (!files.length) return;
    // Show the photos in the chat immediately, like a sent message
    const previews = files.map(f => URL.createObjectURL(f));
    setMessages(prev => [...prev, { images: previews, isBot: false }]);
    setUploadingPhotos(true);
    const urls = await uploadLeadPhotos(files);
    setUploadingPhotos(false);
    if (urls.length) {
      setLeadPhotoUrls(prev => [...prev, ...urls].slice(0, 3));
      setMessages(prev => [...prev, { text: urls.length === 1 ? "📷 Got the photo — Ganaa will review it before the visit. That really helps him bring the right parts!" : `📷 Got ${urls.length} photos — Ganaa will review them before the visit. That really helps him bring the right parts!`, isBot: true }]);
    } else {
      setMessages(prev => [...prev, { text: "Hmm — the photo didn't upload. No problem: you can also text it directly to Ganaa at 703-655-6351 after booking.", isBot: true }]);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, chatState]);

  // Initial greeting
  useEffect(() => {
    const isRealUser = user && !user.isAnonymous;
    const name = isRealUser && user.displayName ? ` ${user.displayName.split(' ')[0]}` : '';
    setMessages([{ text: `Hi${name}! I'm the DMVPipe assistant. I can help you figure out what's going on and get Ganaa — our licensed master plumber — out to fix it.\n\nWhat's happening with your plumbing today?`, isBot: true }]);
    if (isRealUser) setLead(prev => ({ ...prev, name: user.displayName || '', phone: user.phoneNumber || '' }));
    setChatState('ask_issue');
  }, [user]);

  const QUICK_REPLIES = {
    ask_issue: ['💧 Leak or drip', '🔥 Water heater', '🚿 Clogged drain', '🚽 Toilet', '❓ Something else'],
    leak_active: ['Yes, actively leaking', 'No, it stopped / it\'s slow'],
    wh_symptom: ['No hot water at all', 'Not enough / lukewarm', 'Tank is leaking', 'Rumbling or popping noises', 'Rusty or smelly water'],
    drain_scope: ['Just one sink/tub', 'Multiple drains backing up'],
    toilet_symptom: ['Keeps running', 'Clogged / weak flush', 'Leaking at the base'],
    ask_contact_pref: ['📅 Book a visit', '📞 Have Ganaa call me'],
    ask_time: ['Morning (8am–12pm)', 'Afternoon (12pm–4pm)', 'ASAP / Emergency'],
  };

  const bot = (text) => ({ text, isBot: true });

  const advance = (userMsg) => {
    let next = chatState;
    const out = [];
    const l = { ...lead };
    const msgLower = userMsg.toLowerCase();

    switch (chatState) {
      case 'ask_issue': {
        const detected = detectIssue(userMsg) || (msgLower.includes('else') ? 'other' : null);
        l.issueType = detected || 'other';
        l.issue = userMsg;
        if (detected === 'gas') {
          out.push(bot("⚠️ If you smell gas, please treat this as an emergency:\n\n1. Don't flip any switches or light anything\n2. Leave the house and open doors on your way out\n3. Call Washington Gas at 844-927-4427 or 911 from outside\n\nOnce you're safe, Ganaa can inspect and repair gas line issues. Would you like him to call you?"));
          l.urgent = true;
          next = 'ask_contact_pref';
        } else if (detected === 'leak') {
          out.push(bot("Sorry to hear that — let's make sure it's under control. Is water actively leaking right now?"));
          next = 'leak_active';
        } else if (detected === 'water_heater') {
          out.push(bot("Water heater trouble is one of Ganaa's specialties. What are you noticing?"));
          next = 'wh_symptom';
        } else if (detected === 'drain') {
          out.push(bot("Let's narrow it down — is it just one fixture, or are multiple drains backing up?"));
          next = 'drain_scope';
        } else if (detected === 'toilet') {
          out.push(bot("Got it. What is the toilet doing?"));
          next = 'toilet_symptom';
        } else if (detected === 'sump') {
          out.push(bot("A failing sump pump can mean a flooded basement in the next storm, so it's smart to address it early. Quick tip: if it's humming but not pumping, the impeller may be jammed; if it's silent, check the breaker first.\n\nEither way, Ganaa can test and repair or replace it. How would you like to proceed?"));
          next = 'ask_contact_pref';
        } else if (detected === 'disposal') {
          out.push(bot("Quick safety note: never put your hand in the disposal, even when it's off.\n\nIf it hums but doesn't spin, it's usually jammed — many models can be freed with the hex key slot underneath. If it does nothing at all, try the red reset button on the bottom. If neither works, it likely needs repair or replacement.\n\nWant Ganaa to take a look?"));
          next = 'ask_contact_pref';
        } else {
          out.push(bot("Thanks for the details. Ganaa handles all residential plumbing — from small repairs to full repiping — so this is likely something he can fix. Could you describe the issue in a bit more detail? (Where is it, and when did it start?)"));
          next = 'other_details';
        }
        break;
      }

      case 'leak_active': {
        l.details = `Active leak: ${userMsg}`;
        if (msgLower.includes('yes') || msgLower.includes('active')) {
          l.urgent = true;
          out.push(bot("Okay — first, let's stop the water:\n\n1. Find your main shut-off valve. It's usually in the basement or crawl space on the wall facing the street, near the water meter, or where the main line enters the house.\n2. Turn it clockwise until it stops.\n3. Open a faucet on the lowest floor to drain pressure from the pipes.\n\nThis will stop the damage while help is on the way. Ganaa treats active leaks as emergencies — let's get your info so he can respond right away."));
          next = 'ask_name';
        } else {
          out.push(bot("Good — that gives us some breathing room. Even a stopped or slow leak deserves prompt attention though: hidden moisture leads to mold and drywall damage within days, and a small drip can waste thousands of gallons a year.\n\nLet's get Ganaa out to find the source and fix it properly."));
          next = 'ask_name';
        }
        break;
      }

      case 'wh_symptom': {
        l.details = `Water heater: ${userMsg}`;
        if (msgLower.includes('no hot')) {
          out.push(bot("If there's no hot water at all: on a gas unit, the pilot light may be out; on electric, check if the breaker tripped. If those look fine, the heating element or gas valve has likely failed — a job for a licensed plumber.\n\nGanaa repairs and replaces both tank and tankless units. Let's get your info."));
        } else if (msgLower.includes('lukewarm') || msgLower.includes('not enough')) {
          out.push(bot("Running out of hot water faster than before usually means sediment has built up in the tank (it takes up space and insulates the heating element), or one heating element has failed. If your heater is 8–12+ years old, replacement often makes more sense than repair — Ganaa will give you an honest recommendation either way, not a sales pitch."));
        } else if (msgLower.includes('leaking')) {
          l.urgent = true;
          out.push(bot("A leaking tank is serious — tanks don't heal, and a full failure can dump 40–80 gallons onto your floor.\n\nTwo quick steps now:\n1. Turn the cold water supply valve on top of the heater clockwise to close it\n2. For gas: turn the dial to 'off'. For electric: flip the water heater breaker\n\nThen let's get Ganaa out quickly."));
        } else if (msgLower.includes('rumbl') || msgLower.includes('popping') || msgLower.includes('noise')) {
          out.push(bot("Rumbling or popping is the classic sign of sediment buildup — water trapped under hardened sediment boils and pops. It makes the heater inefficient and shortens its life. Caught early, a flush can fix it; left alone, it usually leads to tank failure.\n\nWorth having Ganaa take a look soon."));
        } else {
          out.push(bot("Rusty or smelly hot water usually means the anode rod is spent or the tank is corroding from the inside — an early warning that the tank is nearing the end of its life. Ganaa can inspect it and tell you honestly whether it's a simple fix or time to replace."));
        }
        next = 'ask_name';
        break;
      }

      case 'drain_scope': {
        l.details = `Drain: ${userMsg}`;
        if (msgLower.includes('multiple')) {
          l.urgent = true;
          out.push(bot("Multiple drains backing up at once usually points to a main sewer line blockage — often tree roots or a collapsed section, not something a plunger can fix. Please avoid running water or flushing until it's checked, as it can back up into the lowest drain in the house.\n\nGanaa can diagnose exactly where the blockage is."));
        } else {
          out.push(bot("One quick honest tip: skip the chemical drain cleaners. They rarely clear real clogs, they damage pipes over time, and they make the job hazardous for whoever opens the drain afterward.\n\nA proper auger or hydro-jet clears it safely and completely — usually a quick visit for Ganaa."));
        }
        next = 'ask_name';
        break;
      }

      case 'toilet_symptom': {
        l.details = `Toilet: ${userMsg}`;
        if (msgLower.includes('running')) {
          out.push(bot("A constantly running toilet is usually a worn flapper or fill valve — a small part, but it can waste up to 200 gallons a day, which shows up on your water bill fast. It's an inexpensive fix when done right."));
        } else if (msgLower.includes('clog') || msgLower.includes('flush')) {
          out.push(bot("If plunging hasn't cleared it, or clogs keep coming back, there may be a blockage deeper in the drain line or an issue with the toilet itself. Repeated weak flushes can also mean mineral buildup in the rim jets on older toilets."));
        } else {
          out.push(bot("Water at the base of the toilet usually means the wax ring seal has failed. Don't keep using it — water seeping under the flooring causes rot you can't see until it's expensive. The fix (new ring, properly reset toilet) is quick for a pro."));
        }
        out.push(bot("Let's get Ganaa to fix it properly. Can I get your name?"));
        next = 'ask_name';
        break;
      }

      case 'other_details': {
        l.details = userMsg;
        out.push(bot("Thanks — that helps. Ganaa will know exactly what to check when he sees this. Let's get your info so he can follow up. What's your name?"));
        next = 'ask_name';
        break;
      }

      case 'ask_contact_pref': {
        if (msgLower.includes('call')) {
          l.time = 'Phone call requested';
          out.push(bot("Perfect. What's your name?"));
        } else {
          out.push(bot("Great. What's your name?"));
        }
        next = 'ask_name';
        break;
      }

      case 'ask_name': {
        l.name = userMsg;
        out.push(bot(`Thanks, ${l.name.split(' ')[0]}! What's the best phone number to reach you? (Ganaa confirms every request personally.)`));
        next = 'ask_phone';
        break;
      }

      case 'ask_phone': {
        const digits = userMsg.replace(/\D/g, '');
        if (digits.length < 10) {
          out.push(bot("That number looks a little short — could you double-check it? A 10-digit number like 703-555-1234 works best."));
          next = 'ask_phone';
        } else {
          l.phone = userMsg;
          out.push(bot("Got it. What's the full service address? (Street and city — e.g. 123 Main St, Arlington, VA)"));
          next = 'ask_city';
        }
        break;
      }

      case 'ask_city': {
        l.address = userMsg;
        if (l.urgent) {
          l.time = 'ASAP / Emergency';
          out.push(bot(`Thank you. Here's what I have:\n\n• Issue: ${ISSUE_LABELS[l.issueType] || 'Plumbing issue'} — ${l.details || l.issue}\n• Name: ${l.name}\n• Phone: ${l.phone}\n• Address: ${l.address}\n• Priority: 🚨 URGENT\n\nGanaa has been notified and will reach out as soon as possible. If this is a severe emergency, don't wait — call him directly at 703-655-6351.`));
          next = 'finish';
        } else {
          out.push(bot("Almost done! When would work best for a visit?"));
          next = 'ask_time';
        }
        break;
      }

      case 'ask_time': {
        l.time = userMsg;
        out.push(bot(`All set! Here's what I've sent to Ganaa:\n\n• Issue: ${ISSUE_LABELS[l.issueType] || 'Plumbing issue'} — ${l.details || l.issue}\n• Name: ${l.name}\n• Phone: ${l.phone}\n• Address: ${l.address}\n• Preferred time: ${l.time}\n\nHe personally reviews every request and will confirm with you shortly — usually within the hour during the day. Thanks for choosing DMVPipe!`));
        next = 'finish';
        break;
      }

      case 'finish': {
        out.push(bot("If anything else comes up, I'm here — or call Ganaa directly at 703-655-6351."));
        break;
      }

      default: {
        out.push(bot("I'm here to help with any residential plumbing question. For emergencies, call 703-655-6351."));
      }
    }

    return { next, out, l };
  };

  const processUserInput = (userMsg) => {
    setMessages(prev => [...prev, { text: userMsg, isBot: false }]);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      const { next, out, l } = advance(userMsg);
      setLead(l);
      setMessages(prev => [...prev, ...out]);
      setChatState(next);
      setLoading(false);
      if (next === 'finish' && chatState !== 'finish') saveLeadToDatabase(l);
    }, 700);
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    processUserInput(input.trim());
  };

  const handleQuickReply = (text) => {
    if (loading) return;
    processUserInput(text.replace(/^[^\w]+\s*/, ''));
  };

  const saveLeadToDatabase = async (data) => {
    if (!db) return;
    try {
      const photoUrls = leadPhotoUrls;
      notifyGanaa(`${data.urgent ? '🚨 URGENT chat lead' : '💬 New chat lead'} — DMVPipe`, {
        Priority: data.urgent ? 'URGENT' : 'Normal',
        Issue: ISSUE_LABELS[data.issueType] || 'Plumbing issue',
        Details: data.details || data.issue,
        Name: data.name, Phone: data.phone, City: data.address, 'Preferred time': data.time,
        'Situation photos': photoUrls.length ? photoUrls.join('  |  ') : 'None'
      });
      const currentUserId = (user && !user.isAnonymous) ? user.uid : 'simulated_user_123';
      const appointmentsRef = collection(db, 'artifacts', appId, 'users', currentUserId, 'appointments');
      await addDoc(appointmentsRef, {
        serviceType: `${ISSUE_LABELS[data.issueType] || 'Plumbing issue'} (ChatBot)`,
        date: data.time || 'TBD',
        time: data.time || 'TBD',
        address: data.address || 'Not provided',
        photos: photoUrls,
        notes: `Issue: ${data.issue}. Details: ${data.details}. Contact Phone: ${data.phone}`,
        customerName: data.name,
        status: data.urgent ? 'URGENT' : 'pending',
        isEmergency: !!data.urgent,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error saving chatbot lead:", err);
    }
  };

  const quickReplies = QUICK_REPLIES[chatState];

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-stone-50">
      <div className="grow min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'}`}>
            {msg.images ? (
              <div className="max-w-[85%] bg-blue-700 rounded-2xl rounded-tr-none p-1.5 shadow-sm flex gap-1.5">
                {msg.images.map((src, j) => (
                  <img key={j} src={src} alt={`Sent photo ${j + 1}`} className="w-20 h-20 object-cover rounded-xl" />
                ))}
              </div>
            ) : (
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${msg.isBot ? 'bg-white border border-stone-200 text-stone-800 rounded-tl-none shadow-sm' : 'bg-blue-700 text-white rounded-tr-none shadow-sm'}`}>
                {msg.text}
              </div>
            )}
          </div>
        ))}
        {uploadingPhotos && (
          <div className="flex justify-end">
            <div className="bg-blue-100 text-blue-800 rounded-full px-4 py-1.5 text-xs font-semibold animate-pulse">Sending photo…</div>
          </div>
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-stone-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                <div className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
              </div>
            </div>
          </div>
        )}

        {(lead.urgent && (chatState === 'ask_name' || chatState === 'ask_contact_pref' || chatState === 'finish')) && !loading && (
          <div className="flex justify-center pt-1">
            <a href="tel:7036556351" className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-full shadow flex items-center gap-2">
              <Phone className="w-3.5 h-3.5" /> Emergency? Call 703-655-6351 now
            </a>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {quickReplies && !loading && (
        <div className="px-3 pb-2 flex flex-col gap-1.5 max-h-48 overflow-y-auto shrink-0">
          {quickReplies.map(qr => (
            <button
              key={qr}
              onClick={() => handleQuickReply(qr)}
              className="w-full text-left bg-blue-50 text-blue-900 hover:bg-blue-100 active:bg-blue-200 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border border-blue-100 shadow-sm"
            >
              {qr}
            </button>
          ))}
        </div>
      )}

      <div className="p-3 bg-white border-t border-stone-200">
        <form onSubmit={handleSend} className="flex gap-2 items-center">
          <input ref={photoInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { attachPhotos(e.target.files); e.target.value = ''; }} />
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhotos || chatState === 'finish' || leadPhotoUrls.length >= 3}
            aria-label="Send a photo of the problem"
            title={leadPhotoUrls.length >= 3 ? 'Photo limit reached (3)' : 'Send a photo of the problem'}
            className="bg-stone-100 hover:bg-blue-50 text-stone-500 hover:text-blue-700 p-2.5 rounded-full transition-colors disabled:opacity-40 shrink-0"
          >
            <Camera className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={chatState === 'finish' ? "Chat finished — call us anytime!" : "Type here, or tap 📷 to send a photo"}
            disabled={loading || chatState === 'finish'}
            className="grow min-w-0 bg-stone-100 border border-stone-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-all"
          />
          <button
            type="submit"
            disabled={loading || !input.trim() || chatState === 'finish'}
            className="bg-blue-700 text-white p-2.5 rounded-full hover:bg-blue-800 transition-colors disabled:opacity-50 shadow-md flex items-center justify-center shrink-0"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
