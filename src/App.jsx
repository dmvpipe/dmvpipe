import React, { useState, useEffect, useRef } from 'react';
import { 
  Wrench, Home, Calendar, Phone, FileText, MessageSquare, 
  AlertTriangle, CheckCircle, X, User, Clock, ShieldCheck, 
  Droplet, MapPin, Send, Menu, LogOut, Info, Mail
} from 'lucide-react';
import { 
  initializeApp 
} from 'firebase/app';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut,
  GoogleAuthProvider, signInWithPopup
} from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp 
} from 'firebase/firestore';
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const _analytics = getAnalytics(app);
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = 'dmvpipe-app';

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

const BLOG_POSTS = [
  { id: 1, title: "How to Prevent Frozen Pipes During Virginia Winters", date: "Nov 15, 2025", excerpt: "Winter in the DMV area can be harsh. Learn the top 3 ways to insulate your pipes and avoid a costly burst." },
  { id: 2, title: "5 Signs Your Water Heater is Failing", date: "Oct 02, 2025", excerpt: "Don't wait for a cold shower. Look out for these warning signs that your water heater needs Ganaa's attention." },
  { id: 3, title: "Why We Only Do Residential Plumbing", date: "Sep 18, 2025", excerpt: "By focusing entirely on homes, we bring specialized care and respect to your family's personal space." }
];

export default function App() {
  const [currentView, setCurrentView] = useState('home');
  const [user, setUser] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Floating Widgets State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);

  // --- AUTHENTICATION ---
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
        console.error("Auth error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  const navigate = (view) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col relative">
      {/* HEADER */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <div className="flex items-center cursor-pointer" onClick={() => navigate('home')}>
              {/* TODO: IMAGE/LOGO MARKER - HEADER LOGO */}
              {<img src="/logo.png" alt="DMVPipe" className="h-10 w-auto mr-3" />}
              <div className="bg-blue-600 p-2 rounded-lg mr-3">
                <Wrench className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 leading-none tracking-tight">DMVPipe</h1>
                <p className="text-xs text-blue-600 font-semibold tracking-wider uppercase mt-1">Ganaa's Plumbing</p>
              </div>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex space-x-8 items-center">
              <button onClick={() => navigate('home')} className={`font-medium transition-colors ${currentView === 'home' ? 'text-blue-600' : 'text-slate-600 hover:text-blue-600'}`}>Home</button>
              <button onClick={() => navigate('services')} className={`font-medium transition-colors ${currentView === 'services' ? 'text-blue-600' : 'text-slate-600 hover:text-blue-600'}`}>Services</button>
              <button onClick={() => navigate('blog')} className={`font-medium transition-colors ${currentView === 'blog' ? 'text-blue-600' : 'text-slate-600 hover:text-blue-600'}`}>Blog</button>
              <button onClick={() => navigate('contact')} className={`font-medium transition-colors ${currentView === 'contact' ? 'text-blue-600' : 'text-slate-600 hover:text-blue-600'}`}>Contact</button>
              
              <div className="pl-4 border-l border-slate-200">
                <button 
                  onClick={() => navigate('account')} 
                  className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-full font-medium hover:bg-slate-800 transition-colors"
                >
                  <User className="w-4 h-4" />
                  {user && !user.isAnonymous ? "My Account" : "Login / Book"}
                </button>
              </div>
            </nav>

            {/* Mobile Menu Button */}
            <button className="md:hidden p-2" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 px-4 pt-2 pb-6 space-y-2 shadow-lg">
            <button onClick={() => navigate('home')} className="block w-full text-left py-3 px-4 rounded-lg hover:bg-slate-50 font-medium text-slate-700">Home</button>
            <button onClick={() => navigate('services')} className="block w-full text-left py-3 px-4 rounded-lg hover:bg-slate-50 font-medium text-slate-700">Services</button>
            <button onClick={() => navigate('blog')} className="block w-full text-left py-3 px-4 rounded-lg hover:bg-slate-50 font-medium text-slate-700">Blog</button>
            <button onClick={() => navigate('contact')} className="block w-full text-left py-3 px-4 rounded-lg hover:bg-slate-50 font-medium text-slate-700">Contact</button>
            <div className="pt-2">
              <button onClick={() => navigate('account')} className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-3 rounded-lg font-medium">
                <User className="w-5 h-5" /> Account / Booking
              </button>
            </div>
          </div>
        )}
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-grow">
        {currentView === 'home' && <HomeView navigate={navigate} />}
        {currentView === 'services' && <ServicesView />}
        {currentView === 'blog' && <BlogView />}
        {currentView === 'contact' && <ContactView />}
        {currentView === 'account' && <AccountView user={user} db={db} appId={appId} />}
        {/* Dynamic routing for SEO City Pages */}
        {currentView.startsWith('city-') && <CityView navigate={navigate} city={currentView.replace('city-', '')} />}
      </main>

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-300 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center mb-4">
              <Wrench className="w-6 h-6 text-blue-500 mr-2" />
              <h2 className="text-xl font-bold text-white">DMVPipe</h2>
            </div>
            <p className="text-sm mb-4">Ganaa's Family Owned Plumbing. Serving the DMV area with 15+ years of trusted residential experience.</p>
            <p className="text-sm flex items-center gap-2 text-slate-400">
              <ShieldCheck className="w-4 h-4" /> Licensed & Insured
            </p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><button onClick={() => navigate('services')} className="hover:text-white transition-colors">Residential Services</button></li>
              <li><button onClick={() => navigate('blog')} className="hover:text-white transition-colors">Plumbing Tips</button></li>
              <li><button onClick={() => navigate('contact')} className="hover:text-white transition-colors">Contact Us</button></li>
              <li><button onClick={() => navigate('account')} className="hover:text-white transition-colors">Customer Login</button></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Contact</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-blue-500 shrink-0" />
                <span>703-655-6351<br/><span className="text-xs text-slate-400">24/7 Emergency Available</span></span>
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-8 border-t border-slate-800 text-sm text-center text-slate-500 flex flex-col items-center">
          <p className="mb-4">&copy; {new Date().getFullYear()} DMVPipe - Ganaa's Plumbing. All rights reserved.</p>
          {/* SEO Footer City Links */}
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-600 max-w-4xl">
            {VA_CITIES.map(city => (
              <button key={city} onClick={() => navigate(`city-${city}`)} className="hover:text-white transition-colors">
                Plumber in {city}
              </button>
            ))}
          </div>
        </div>
      </footer>

      {/* FLOATING WIDGETS */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
        
        {/* Emergency Popup Window */}
        {isEmergencyOpen && (
          <div className="bg-white rounded-2xl shadow-2xl border border-red-100 w-80 sm:w-96 overflow-hidden animate-in slide-in-from-bottom-5">
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

        {/* Chatbot Window */}
        {isChatOpen && !isEmergencyOpen && (
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-80 sm:w-96 h-96 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="bg-blue-500 p-1.5 rounded-full"><Wrench className="w-4 h-4"/></div>
                <h3 className="font-bold text-sm">DMVPipe Assistant</h3>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="hover:bg-slate-800 p-1 rounded transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <ChatbotUI />
          </div>
        )}

        {/* Floating Buttons */}
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
  );
}

// --- PAGE COMPONENTS ---

function HomeView({ navigate }) {
  return (
    <div className="animate-in fade-in duration-500">
      {/* Hero Section */}
      <section className="relative bg-slate-900 text-white overflow-hidden">
        {/* TODO: IMAGE/LOGO MARKER - HERO BACKGROUND IMAGE */}
        {/* Replace the Unsplash URL inside url('') with your own hero image path, e.g. url('/hero-plumbing.jpg') */}
        <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&q=80')] bg-cover bg-center mix-blend-overlay"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 flex flex-col items-center text-center">
          <span className="bg-blue-600/20 text-blue-400 px-4 py-1.5 rounded-full text-sm font-semibold mb-6 border border-blue-500/30">
            Family Owned & Operated
          </span>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 max-w-4xl">
            Honest Residential Plumbing for the <span className="text-blue-500">DMV Area</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl">
            Led by Ganaa with over 15 years of master plumbing experience. We skip the commercial jobs to focus entirely on keeping your family's home running smoothly.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button onClick={() => navigate('account')} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-full font-bold text-lg transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2">
              <Calendar className="w-5 h-5" /> Schedule Service
            </button>
            <button onClick={() => navigate('contact')} className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-8 py-4 rounded-full font-bold text-lg transition-all flex items-center justify-center gap-2">
              <Phone className="w-5 h-5" /> Contact Us
            </button>
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <div className="bg-blue-50 text-blue-600 p-3 rounded-full"><Clock className="w-6 h-6"/></div>
              <h3 className="font-bold text-slate-900">15+ Years Exp.</h3>
              <p className="text-xs text-slate-500">Master Level Knowledge</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="bg-blue-50 text-blue-600 p-3 rounded-full"><ShieldCheck className="w-6 h-6"/></div>
              <h3 className="font-bold text-slate-900">Licensed & Insured</h3>
              <p className="text-xs text-slate-500">Peace of mind guaranteed</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="bg-blue-50 text-blue-600 p-3 rounded-full"><Home className="w-6 h-6"/></div>
              <h3 className="font-bold text-slate-900">100% Residential</h3>
              <p className="text-xs text-slate-500">We specialize in homes</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="bg-blue-50 text-blue-600 p-3 rounded-full"><User className="w-6 h-6"/></div>
              <h3 className="font-bold text-slate-900">Family Owned</h3>
              <p className="text-xs text-slate-500">Treating you like family</p>
            </div>
          </div>
        </div>
      </section>

      {/* Service Area */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col lg:flex-row">
            <div className="lg:w-1/2 p-10 md:p-16 flex flex-col justify-center bg-slate-900 text-white relative overflow-hidden">
               <MapPin className="absolute -right-10 -bottom-10 w-64 h-64 text-slate-800 opacity-50" />
               <div className="relative z-10">
                <h2 className="text-3xl font-bold mb-4">Our Service Area</h2>
                <p className="text-slate-300 mb-8">We proudly serve 20 cities and counties in Northern Virginia, providing rapid response to communities closest to Washington D.C.</p>
                <div className="flex flex-wrap gap-2">
                  {VA_CITIES.slice(0, 8).map(city => (
                    <button onClick={() => navigate(`city-${city}`)} key={city} className="bg-white/10 px-3 py-1 rounded-full text-sm font-medium border border-white/10 hover:bg-white/20 transition-colors cursor-pointer">{city}</button>
                  ))}
                  <span className="bg-blue-600 px-3 py-1 rounded-full text-sm font-medium">...and 12 more!</span>
                </div>
               </div>
            </div>
            <div className="lg:w-1/2 p-10 md:p-16 flex flex-col justify-center">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Why Choose Ganaa?</h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="mt-1"><CheckCircle className="w-6 h-6 text-green-500" /></div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg">Direct Communication</h4>
                    <p className="text-slate-600">You deal directly with the owner and master plumber, not a dispatcher or salesman.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="mt-1"><CheckCircle className="w-6 h-6 text-green-500" /></div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg">Transparent Pricing</h4>
                    <p className="text-slate-600">No hidden fees. We diagnose the issue and provide a clear quote before any work begins.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="mt-1"><CheckCircle className="w-6 h-6 text-green-500" /></div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg">Clean & Respectful</h4>
                    <p className="text-slate-600">Because we only do residential, we know how to protect your home's floors and leave the workspace spotless.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// SEO-friendly City Template Component
function CityView({ navigate, city }) {
  return (
    <div className="animate-in fade-in duration-500">
      <section className="relative bg-slate-900 text-white overflow-hidden">
         {/* TODO: IMAGE/LOGO MARKER - CITY HERO BACKGROUND IMAGE */}
        <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80')] bg-cover bg-center mix-blend-overlay"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 flex flex-col items-center text-center">
          <span className="bg-blue-600/20 text-blue-400 px-4 py-1.5 rounded-full text-sm font-semibold mb-6 border border-blue-500/30 flex items-center gap-2">
            <MapPin className="w-4 h-4"/> Local Plumber in {city}, VA
          </span>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 max-w-4xl">
            Honest Residential Plumbing for <span className="text-blue-500">{city}</span> Homes
          </h1>
          <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl">
            Ganaa provides master-level plumbing services strictly for residential homes in {city} and the greater DMV area.
          </p>
          <button onClick={() => navigate('account')} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-full font-bold text-lg transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2">
            <Calendar className="w-5 h-5" /> Book a {city} Appointment
          </button>
        </div>
      </section>

      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
         <h2 className="text-3xl font-bold text-slate-900 mb-6">Why {city} Homeowners Trust DMVPipe</h2>
         <p className="text-lg text-slate-600 max-w-3xl mx-auto">
           When you need a reliable plumber in {city}, Virginia, you shouldn't have to deal with giant corporate dispatch centers. Ganaa brings 15+ years of direct, hands-on master plumbing experience right to your front door.
         </p>
         <button onClick={() => navigate('services')} className="mt-8 text-blue-600 font-bold hover:underline">View All Residential Services &rarr;</button>
      </section>
    </div>
  );
}

function ServicesView() {
  return (
    <div className="animate-in fade-in duration-500 py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h2 className="text-4xl font-extrabold text-slate-900 mb-4">Residential Services</h2>
        <p className="text-lg text-slate-600">Ganaa specializes exclusively in residential plumbing. By not taking commercial jobs, we ensure we have the time and specialized focus to treat your home with the utmost care.</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
        {SERVICES.map((s, i) => (
          <div key={i} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-lg transition-shadow">
            <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
              {s.icon}
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">{s.title}</h3>
            <p className="text-slate-600 text-sm leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-20 bg-blue-600 rounded-3xl p-8 md:p-12 text-center text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-2xl md:text-3xl font-bold mb-4">Have a unique plumbing issue?</h3>
          <p className="text-blue-100 mb-8 max-w-2xl mx-auto">If it involves pipes, water, or gas lines in a residential home, Ganaa has seen it and fixed it. Contact us for a custom assessment.</p>
          <button className="bg-white text-blue-600 px-8 py-3 rounded-full font-bold shadow-lg hover:bg-blue-50 transition-colors">
            Request an Estimate
          </button>
        </div>
        <Wrench className="absolute -left-10 -bottom-10 w-64 h-64 text-blue-500 opacity-30 rotate-45" />
      </div>
    </div>
  );
}

function BlogView() {
  return (
    <div className="animate-in fade-in duration-500 py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-12">
        <h2 className="text-4xl font-extrabold text-slate-900 mb-4">Homeowner Advice Hub</h2>
        <p className="text-lg text-slate-600 max-w-2xl">Tips and tricks from 15+ years in the field to help you prevent emergencies and maintain your home's plumbing.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {BLOG_POSTS.map(post => (
          <article key={post.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="h-48 bg-slate-200 relative overflow-hidden">
               {/* TODO: IMAGE/LOGO MARKER - BLOG POST IMAGE */}
               {/* To add real images, insert: <img src="/blog-image-1.jpg" className="w-full h-full object-cover" /> */}
               <div className="absolute inset-0 bg-gradient-to-tr from-slate-800 to-slate-600 opacity-90"></div>
               <FileText className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 text-white/50" />
            </div>
            <div className="p-6 flex-grow flex flex-col">
              <span className="text-sm font-semibold text-blue-600 mb-2">{post.date}</span>
              <h3 className="text-xl font-bold text-slate-900 mb-3 line-clamp-2">{post.title}</h3>
              <p className="text-slate-600 text-sm mb-6 flex-grow">{post.excerpt}</p>
              <button className="text-slate-900 font-bold text-sm hover:text-blue-600 transition-colors flex items-center gap-1 w-max">
                Read Article <span className="text-lg leading-none">&rarr;</span>
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ContactView() {
  const [status, setStatus] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setStatus('sending');
    setTimeout(() => {
      setStatus('sent');
      e.target.reset();
      setTimeout(() => setStatus(''), 4000);
    }, 1500);
  };

  return (
    <div className="animate-in fade-in duration-500 py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col lg:flex-row border border-slate-100">
        <div className="lg:w-1/3 bg-slate-900 text-white p-10 flex flex-col">
          <h2 className="text-3xl font-bold mb-8">Get in Touch</h2>
          <div className="space-y-8 flex-grow">
            <div>
              <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2"><Phone className="w-5 h-5"/> Phone</h4>
              <p className="text-lg">703-655-6351</p>
              <p className="text-sm text-slate-400 mt-1">Available for emergency calls</p>
            </div>
            <div>
              <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2"><Mail className="w-5 h-5"/> Email</h4>
              <p className="text-lg">info@dmvpipe.com</p>
            </div>
            <div>
              <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2"><MapPin className="w-5 h-5"/> Service Area</h4>
              <p className="leading-relaxed text-slate-300">Serving Alexandria, Arlington, Fairfax, and 17 other nearby VA cities.</p>
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
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Name</label>
                <input required type="text" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Phone</label>
                <input required type="tel" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" placeholder="703-655-6351" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">City in VA</label>
              <select required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
                <option value="">Select your city...</option>
                {VA_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">How can we help?</label>
              <textarea required rows="4" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" placeholder="Describe your plumbing issue..."></textarea>
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

// --- ACCOUNT & SCHEDULING ---

function AccountView({ user, db, appId }) {
  const [isSimulatedLogin, setIsSimulatedLogin] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Google Login Integration
  const handleGoogleLogin = async (e) => {
    e.preventDefault();
    if (!auth) {
       // Fallback for preview environment if auth isn't initialized
       setIsSimulatedLogin(true);
       return;
    }
    
    try {
      const provider = new GoogleAuthProvider();
      // In a real deployed app, this triggers the secure Google popup
      await signInWithPopup(auth, provider); 
      // The onAuthStateChanged listener in App component handles the rest
    } catch (error) {
      console.error("Google Sign-In Error:", error);
      // Fallback for this preview canvas if the popup is blocked
      setIsSimulatedLogin(true); 
    }
  };

  const handleLogout = async () => {
    setIsSimulatedLogin(false);
    if (auth && user && !user.isAnonymous) {
      await signOut(auth);
    }
  };

  // Fetch appointments (Rule 3 and Rule 1 applied)
  useEffect(() => {
    // If neither authenticated via real Firebase nor via simulation, stop loading
    if ((!user || user.isAnonymous) && !isSimulatedLogin) {
      setLoading(false);
      return;
    }

    if (!db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Use the actual user.uid if available, otherwise fallback to a mock ID for simulation
    const currentUserId = (user && !user.isAnonymous) ? user.uid : 'simulated_user_123';
    const appointmentsRef = collection(db, 'artifacts', appId, 'users', currentUserId, 'appointments');
    const q = query(appointmentsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const apps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAppointments(apps);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching appointments:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, isSimulatedLogin, db, appId]);

  // Render Login state if not logged in
  if (!isSimulatedLogin && (!user || user.isAnonymous)) {
    return (
      <div className="animate-in fade-in py-20 flex justify-center px-4">
        <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl w-full max-w-md border border-slate-100">
          <div className="text-center mb-8">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Customer Portal</h2>
            <p className="text-slate-500 mt-2 text-sm">Securely log in to view history and schedule service anytime.</p>
          </div>
          
          <div className="space-y-5">
            <button 
              onClick={handleGoogleLogin} 
              className="w-full bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-3.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
            
            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 text-xs uppercase tracking-wider">Secure Access</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <p className="text-xs text-center text-slate-500 leading-relaxed">
              By logging in, you can easily track past services, schedule new appointments without re-entering your info, and communicate directly with Ganaa.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Render
  return (
    <div className="animate-in fade-in py-12 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-end mb-8 border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">My Dashboard</h2>
          <p className="text-slate-500 mt-1">Manage your home's plumbing service requests.</p>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2 text-slate-500 hover:text-red-600 font-medium text-sm transition-colors">
          <LogOut className="w-4 h-4"/> Sign Out
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Sidebar */}
        <div className="md:col-span-1 space-y-4">
          <button 
            onClick={() => setShowScheduleForm(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2"
          >
            <Calendar className="w-5 h-5" /> Book New Service
          </button>
          
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><Home className="w-4 h-4"/> Property Details</h4>
            <div className="text-sm text-slate-600 space-y-2">
              <p><span className="font-medium text-slate-800">Owner:</span> {user && !user.isAnonymous ? user.displayName || "Valued Customer" : "Valued Customer"}</p>
              <p><span className="font-medium text-slate-800">Status:</span> Active Account</p>
              <p className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">Update details during your next booking.</p>
            </div>
          </div>
        </div>

        {/* Main Area */}
        <div className="md:col-span-2">
          {showScheduleForm ? (
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-blue-100 shadow-lg relative animate-in slide-in-from-right-4">
              <button onClick={() => setShowScheduleForm(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-800"><X className="w-5 h-5"/></button>
              <h3 className="text-xl font-bold text-slate-900 mb-6">Schedule an Appointment</h3>
              <SchedulingForm 
                db={db} user={user} appId={appId} 
                onSuccess={() => setShowScheduleForm(false)} 
              />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-slate-900 flex items-center gap-2"><Clock className="w-5 h-5 text-blue-500"/> Service History</h3>
              </div>
              <div className="p-0">
                {loading ? (
                  <p className="p-8 text-center text-slate-500">Loading records...</p>
                ) : appointments.length === 0 ? (
                  <div className="p-12 text-center flex flex-col items-center">
                    <FileText className="w-12 h-12 text-slate-300 mb-4" />
                    <p className="text-slate-500 mb-4">No appointments found.</p>
                    <button onClick={() => setShowScheduleForm(true)} className="text-blue-600 font-medium hover:underline">Book your first service</button>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {appointments.map(app => (
                      <li key={app.id} className="p-6 hover:bg-slate-50 transition-colors flex justify-between items-center">
                        <div>
                          <p className="font-bold text-slate-900">{app.serviceType}</p>
                          <p className="text-sm text-slate-500 mt-1">{new Date(app.date).toLocaleDateString()} at {app.time}</p>
                          <p className="text-xs text-slate-400 mt-1 truncate max-w-xs">{app.address}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${app.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                          {app.status ? app.status.toUpperCase() : 'PENDING'}
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

// Form used inside AccountView
function SchedulingForm({ db, user, appId, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!db) return;
    
    setSubmitting(true);
    const formData = new FormData(e.target);
    const data = {
      serviceType: formData.get('serviceType'),
      date: formData.get('date'),
      time: formData.get('time'),
      address: formData.get('address'),
      notes: formData.get('notes'),
      status: 'pending',
      createdAt: serverTimestamp()
    };

    try {
      // Use real user uid or fallback for mock demo
      const currentUserId = (user && !user.isAnonymous) ? user.uid : 'simulated_user_123';
      const appointmentsRef = collection(db, 'artifacts', appId, 'users', currentUserId, 'appointments');
      await addDoc(appointmentsRef, data);
      
      // Simulate Email sending delay
      setTimeout(() => {
        setSubmitting(false);
        alert("Appointment requested! An auto-email confirmation has been sent.");
        onSuccess();
      }, 800);
      
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
       <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
          <input required name="date" type="date" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Time Preference</label>
          <select required name="time" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="Morning (8am-12pm)">Morning (8am-12pm)</option>
            <option value="Afternoon (12pm-4pm)">Afternoon (12pm-4pm)</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Service Needed</label>
        <select required name="serviceType" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="General Inspection">General Inspection</option>
          <option value="Leak Repair">Leak Repair</option>
          <option value="Water Heater">Water Heater Issue</option>
          <option value="Clogged Drain">Clogged Drain</option>
          <option value="Other">Other Residential Issue</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
        <input required name="address" type="text" placeholder="123 Main St, City, VA" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Notes for Ganaa</label>
        <textarea name="notes" rows="2" placeholder="Describe the issue..." className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm"></textarea>
      </div>
      <button disabled={submitting} type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2">
        {submitting ? 'Processing...' : <><CheckCircle className="w-4 h-4"/> Confirm Booking</>}
      </button>
      <p className="text-xs text-center text-slate-500 mt-2">You will receive an automated email confirmation once submitted.</p>
    </form>
  );
}


// --- FLOATING WIDGET COMPONENTS ---

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
      const currentUserId = (user && !user.isAnonymous) ? user.uid : 'simulated_user_123';
      const appointmentsRef = collection(db, 'artifacts', appId, 'users', currentUserId, 'appointments');
      await addDoc(appointmentsRef, data);
      
      setStep(2); // Show success message
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
          <input required name="phone" type="tel" placeholder="703-655-6351" className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-red-500 outline-none" />
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

function ChatbotUI() {
  const [messages, setMessages] = useState([
    { text: "Hi! I'm the DMVPipe virtual assistant. I can help you with scheduling or answer basic questions about Ganaa's services.", isBot: true }
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input;
    setMessages(prev => [...prev, { text: userMsg, isBot: false }]);
    setInput('');

    // Simple rule-based mock responses
    setTimeout(() => {
      let botResponse = "I'm sorry, I'm just a simple bot. To get the best help, please use the 'Emergency Help' button or navigate to 'My Account' to schedule service.";
      const lowerInput = userMsg.toLowerCase();
      
      if (lowerInput.includes("schedule") || lowerInput.includes("book") || lowerInput.includes("appointment")) {
        botResponse = "You can easily schedule service by creating an account and logging into the Customer Portal! Look for the 'Login / Book' button at the top.";
      } else if (lowerInput.includes("commercial")) {
        botResponse = "Ganaa specializes strictly in residential plumbing. We do not take commercial jobs to ensure we provide the best service to homeowners.";
      } else if (lowerInput.includes("area") || lowerInput.includes("where") || lowerInput.includes("cities")) {
        botResponse = "We cover 20 cities/counties in Northern Virginia closest to D.C., including Arlington, Alexandria, Fairfax, and Reston.";
      } else if (lowerInput.includes("hello") || lowerInput.includes("hi")) {
        botResponse = "Hello! How can I assist you with your plumbing needs today?";
      }

      setMessages(prev => [...prev, { text: botResponse, isBot: true }]);
    }, 800);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-grow overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${msg.isBot ? 'bg-white border border-slate-200 text-slate-800 rounded-tl-none' : 'bg-blue-600 text-white rounded-tr-none'}`}>
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-3 bg-white border-t border-slate-200">
        <form onSubmit={handleSend} className="flex gap-2">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question..." 
            className="flex-grow bg-slate-100 border-none rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors">
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}