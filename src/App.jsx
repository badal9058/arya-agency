import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Package, 
  FileText, 
  History, 
  Settings, 
  Plus, 
  Trash2, 
  Download, 
  Search, 
  Store, 
  Printer, 
  Save, 
  AlertCircle, 
  Calendar, 
  User, 
  Hash, 
  ShoppingBag,
  Users,
  MessageCircle,
  Phone,
  CheckCircle2,
  FileDown,
  X,
  Eye,
  Truck,
  Pencil,
  Building2,
  Share2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';

// --- Firebase Initialization ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'arya-cement-agency';

// --- Constants ---
const CGST_PERCENT = 9; 
const SGST_PERCENT = 9; 

const App = () => {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('billing');
  const [inventory, setInventory] = useState([]);
  const [bills, setBills] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [agencyInfo, setAgencyInfo] = useState({
    name: 'ARYA CEMENT AGENCY',
    address: 'Main Road, Cement Market, Delhi - 110001',
    gstin: '07AABCA1234Z1Z1',
    phone: '9876543210',
    tagline: 'Authorized Dealer - Premium Quality Cement'
  });
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewBill, setPreviewBill] = useState(null); 
  const [editingCustomer, setEditingCustomer] = useState(null);
  
  // Billing States
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]); 
  const [transportDetails, setTransportDetails] = useState({ vehicleNo: '', transportName: '' });
  const [billItems, setBillItems] = useState([{ id: Date.now(), productId: '', quantity: 1, rate: 0 }]);
  const [billNumber, setBillNumber] = useState(`ARYA-${Date.now().toString().slice(-6)}`);

  // Load html2pdf for high quality PDF generation
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // Authentication Setup
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Data Fetching & Syncing
  useEffect(() => {
    if (!user) return;

    // Fetch Agency Profile from Firestore
    const agencyRef = doc(db, 'artifacts', appId, 'public', 'data', 'agency', 'profile');
    const unsubAgency = onSnapshot(agencyRef, (docSnap) => {
      if (docSnap.exists()) setAgencyInfo(docSnap.data());
    });

    // Real-time Inventory (Products)
    const unsubInv = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), (snap) => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    // Real-time Bills History
    const unsubBills = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'bills'), (snap) => {
      setBills(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Real-time Customers List
    const unsubCust = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'customers'), (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubAgency(); unsubInv(); unsubBills(); unsubCust();
    };
  }, [user]);

  // Logic Functions
  const calculateTotals = (items) => {
    const subtotal = items.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
    const cgst = (subtotal * CGST_PERCENT) / 100;
    const sgst = (subtotal * SGST_PERCENT) / 100;
    const total = subtotal + cgst + sgst;
    return { subtotal, cgst, sgst, total };
  };

  const handleUpdateAgency = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newInfo = {
      name: formData.get('name').toUpperCase(),
      address: formData.get('address'),
      gstin: formData.get('gstin').toUpperCase(),
      phone: formData.get('phone'),
      tagline: formData.get('tagline')
    };
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'agency', 'profile'), newInfo);
    alert("Agency Profile Updated!");
  };

  const handleCustomerAction = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      name: formData.get('name'),
      mobile: formData.get('mobile'),
      gstin: formData.get('gstin') || 'URP',
      address: formData.get('address'),
      updatedAt: serverTimestamp()
    };
    if (editingCustomer) {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', editingCustomer.id), data);
      setEditingCustomer(null);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'customers'), data);
    }
    e.target.reset();
  };

  const generatePDF = (billData) => {
    const element = document.getElementById(`pdf-render-${billData.billNumber}`);
    if (!element) return;
    const options = {
      margin: 10,
      filename: `${billData.billNumber}_${billData.customerName}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    window.html2pdf().from(element).set(options).save();
  };

  const sendWhatsApp = (bill, isSelectContact = false) => {
    generatePDF(bill); // Trigger download alongside
    
    const items = bill.items.map((i, idx) => 
      `${idx + 1}. *${i.productName}*%0A   Qty: ${i.quantity} | Rate: ₹${i.rate.toLocaleString()} | Amt: ₹${(i.quantity * i.rate).toLocaleString()}`
    ).join('%0A%0A');

    const transport = (bill.transportDetails?.vehicleNo || bill.transportDetails?.transportName)
      ? `*TRANSPORT DETAILS:*%0A- Vehicle: ${bill.transportDetails.vehicleNo || 'N/A'}%0A- Agency: ${bill.transportDetails.transportName || 'N/A'}%0A%0A`
      : '';

    const msg = `*${bill.agencyInfo?.name || agencyInfo.name}*%0A_${bill.agencyInfo?.tagline || agencyInfo.tagline}_%0A------------------------------------%0A*TAX INVOICE*%0A*Bill No:* ${bill.billNumber}%0A*Date:* ${new Date(bill.date).toLocaleDateString('en-IN')}%0A------------------------------------%0A*CUSTOMER:* ${bill.customerName}%0A*GSTIN:* ${bill.customerGSTIN}%0A*Mob:* +91 ${bill.customerMobile}%0A%0A${transport}*ITEMS:*%0A${items}%0A------------------------------------%0A*Taxable Val:* ₹${bill.totals.subtotal.toLocaleString()}%0A*CGST (9%):* ₹${bill.totals.cgst.toLocaleString()}%0A*SGST (9%):* ₹${bill.totals.sgst.toLocaleString()}%0A*TOTAL AMOUNT:* ₹${bill.totals.total.toLocaleString()}%0A------------------------------------%0A*Note:* Agar aapko bill PDF chahiye toh iss number par bill number WhatsApp karein: *7451917919*%0A------------------------------------%0A*Thank You!*`;
    
    const base = isSelectContact ? `https://api.whatsapp.com/send?text=${msg}` : `https://wa.me/${bill.customerMobile}?text=${msg}`;
    window.open(base, '_blank');
  };

  const finalizeBill = async () => {
    if (isSaving) return;
    const cust = customers.find(c => c.id === selectedCustomerId);
    if (!cust) return alert("Kripya Customer select karein.");
    
    setIsSaving(true);
    const totals = calculateTotals(billItems);
    const dateObj = new Date(billDate);
    
    const billData = {
      billNumber,
      agencyInfo,
      customerId: selectedCustomerId,
      customerName: cust.name,
      customerMobile: cust.mobile,
      customerGSTIN: cust.gstin,
      customerAddress: cust.address,
      transportDetails,
      items: billItems.map(item => ({
        ...item,
        productName: inventory.find(p => p.id === item.productId)?.name || 'Product',
        hsnCode: inventory.find(p => p.id === item.productId)?.hsnCode || '2523'
      })),
      totals,
      date: dateObj.toISOString(),
      folderPath: `${dateObj.getFullYear()}/${dateObj.toLocaleString('default', { month: 'long' })}`,
      timestamp: Date.now()
    };

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bills'), billData);
      // Reset Counter
      setSelectedCustomerId('');
      setBillItems([{ id: Date.now(), productId: '', quantity: 1, rate: 0 }]);
      setBillNumber(`ARYA-${Date.now().toString().slice(-6)}`);
      setTransportDetails({ vehicleNo: '', transportName: '' });
      alert("Bill Saved Successfully!");
      setPreviewBill(billData);
    } catch (e) { alert(e.message); } 
    finally { setIsSaving(false); }
  };

  // --- UI Templates ---
  const InvoiceTemplate = ({ bill, id }) => {
    const showTransport = !!(bill.transportDetails?.vehicleNo || bill.transportDetails?.transportName);
    return (
      <div id={id} className="p-10 bg-white w-full max-w-[210mm] mx-auto text-slate-800 rounded-xl border border-slate-100 shadow-2xl">
        <div className="flex justify-between items-start border-b-4 border-blue-600 pb-8">
          <div>
            <h1 className="text-4xl font-black text-blue-600 tracking-tighter uppercase">{bill.agencyInfo?.name || agencyInfo.name}</h1>
            <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-wider">{bill.agencyInfo?.tagline || agencyInfo.tagline}</p>
            <p className="text-[10px] mt-6 leading-relaxed font-bold text-slate-400">
              {bill.agencyInfo?.address || agencyInfo.address}<br/>
              GSTIN: <span className="text-slate-900">{bill.agencyInfo?.gstin || agencyInfo.gstin}</span> | 
              Contact: <span className="text-slate-900">{bill.agencyInfo?.phone || agencyInfo.phone}</span>
            </p>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-black text-slate-900">TAX INVOICE</h2>
            <div className="mt-4 space-y-1 font-bold text-sm">
              <p>Invoice No: <span className="text-blue-600">#{bill.billNumber}</span></p>
              <p>Dated: {new Date(bill.date).toLocaleDateString('en-IN')}</p>
            </div>
          </div>
        </div>

        <div className={`grid ${showTransport ? 'grid-cols-2' : 'grid-cols-1'} gap-8 mt-10`}>
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
            <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-3">Consumer Details</h3>
            <p className="text-xl font-black text-slate-900">{bill.customerName}</p>
            <div className="mt-3 space-y-1 font-bold text-sm text-slate-600">
              <p>Mobile: +91 {bill.customerMobile}</p>
              <p>GSTIN: {bill.customerGSTIN}</p>
              <p className="text-xs mt-2 italic font-normal text-slate-400 leading-relaxed">Address: {bill.customerAddress}</p>
            </div>
          </div>
          {showTransport && (
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-center">
              <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-3">Transport & Shipping</h3>
              <div className="space-y-2 font-bold text-sm">
                <p>Vehicle: <span className="text-slate-900">{bill.transportDetails?.vehicleNo || 'N/A'}</span></p>
                <p>Agency: <span className="text-slate-900">{bill.transportDetails?.transportName || 'Direct'}</span></p>
              </div>
            </div>
          )}
        </div>

        <table className="w-full mt-10 border-collapse border border-slate-100 rounded-xl overflow-hidden shadow-sm">
          <thead>
            <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
              <th className="p-4 text-left">Description</th>
              <th className="p-4 text-center">HSN</th>
              <th className="p-4 text-center">Qty</th>
              <th className="p-4 text-center">Rate</th>
              <th className="p-4 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bill.items.map((i, idx) => (
              <tr key={idx} className="text-sm font-bold">
                <td className="p-4 py-5 font-black">{i.productName}</td>
                <td className="p-4 py-5 text-center text-slate-400 font-mono text-xs">{i.hsnCode}</td>
                <td className="p-4 py-5 text-center">{i.quantity}</td>
                <td className="p-4 py-5 text-center">{i.rate.toLocaleString('en-IN')}</td>
                <td className="p-4 py-5 text-right font-black">{(i.quantity * i.rate).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-10 flex justify-end">
          <div className="w-80 space-y-3 bg-slate-950 text-white p-8 rounded-3xl shadow-xl">
            <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest"><span>Subtotal</span><span>₹{bill.totals.subtotal.toLocaleString()}</span></div>
            <div className="flex justify-between text-xs font-bold text-blue-400 uppercase italic"><span>CGST @ 9%</span><span>+ ₹{bill.totals.cgst.toLocaleString()}</span></div>
            <div className="flex justify-between text-xs font-bold text-blue-400 uppercase italic"><span>SGST @ 9%</span><span>+ ₹{bill.totals.sgst.toLocaleString()}</span></div>
            <div className="pt-5 border-t border-slate-800 flex justify-between items-end"><span className="text-sm font-black text-slate-400">GRAND TOTAL</span><span className="text-3xl font-black tracking-tighter">₹{bill.totals.total.toLocaleString()}</span></div>
          </div>
        </div>

        <div className="mt-20 flex justify-between items-end border-t border-slate-100 pt-10">
          <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest max-w-sm">
            <p className="text-slate-800 mb-2 font-black underline">Important Terms:</p>
            <p>1. Computer generated bill. No signature required.</p>
            <p>2. Subject to Delhi Jurisdiction.</p>
            <p>3. Goods once sold cannot be returned.</p>
          </div>
          <div className="text-center w-64">
            <div className="h-10 flex items-center justify-center font-serif italic text-slate-200">Seal & Signature</div>
            <p className="text-sm font-black text-slate-900 border-t-2 border-slate-900 pt-2 uppercase tracking-tighter">Arya Cement Agency</p>
          </div>
        </div>
      </div>
    );
  };

  const Sidebar = () => (
    <div className="w-72 bg-slate-950 text-white h-screen flex flex-col p-6 fixed left-0 top-0 z-30 shadow-2xl">
      <div className="flex items-center gap-4 mb-12">
        <div className="p-3 bg-blue-600 rounded-2xl shadow-xl shadow-blue-500/30"><Store size={28} /></div>
        <div><h1 className="font-black text-xl leading-none tracking-tighter uppercase">Arya Agency</h1><p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">Management</p></div>
      </div>
      <nav className="flex flex-col gap-3">
        {[
          { id: 'billing', label: 'Billing Counter', icon: Printer },
          { id: 'customers', label: 'Manage Customers', icon: Users },
          { id: 'inventory', label: 'Add Products', icon: Package },
          { id: 'history', label: 'History Records', icon: History },
          { id: 'settings', label: 'Agency Profile', icon: Building2 }
        ].map(item => (
          <button key={item.id} onClick={() => { setActiveTab(item.id); setEditingCustomer(null); }} className={`flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 ${activeTab === item.id ? 'bg-blue-600 shadow-xl shadow-blue-600/30 translate-x-1' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
            <item.icon size={20} /> <span className="font-bold">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="mt-auto pt-6 border-t border-slate-800 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50"></div>
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Live Cloud Sync</span>
      </div>
    </div>
  );

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 font-black text-xs uppercase tracking-[0.3em] animate-pulse">Arya Agency Online</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-950 antialiased selection:bg-blue-100 selection:text-blue-900">
      <Sidebar />
      <main className="flex-1 ml-72 p-10 overflow-y-auto">
        
        {/* PREVIEW MODAL */}
        {previewBill && (
          <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-start justify-center p-8 overflow-y-auto">
            <div className="relative w-full max-w-4xl animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center bg-white p-5 rounded-t-2xl sticky top-0 border-b z-10 shadow-sm">
                <div className="flex gap-4">
                  <button onClick={() => generatePDF(previewBill)} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"><FileDown size={18}/> PDF Download</button>
                  <button onClick={() => sendWhatsApp(previewBill)} className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20"><MessageCircle size={18}/> Send Text Bill</button>
                  <button onClick={() => sendWhatsApp(previewBill, true)} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-black transition-all shadow-lg"><Share2 size={18}/> Select Contact</button>
                </div>
                <button onClick={() => setPreviewBill(null)} className="p-3 hover:bg-slate-100 rounded-full text-slate-500"><X size={26}/></button>
              </div>
              <div className="bg-white rounded-b-2xl pb-10 shadow-2xl">
                <InvoiceTemplate bill={previewBill} id={`pdf-render-${previewBill.billNumber}`} />
              </div>
            </div>
          </div>
        )}

        {/* 1. BILLING TAB */}
        {activeTab === 'billing' && (
          <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-5 duration-500">
            <header className="flex justify-between items-end">
              <div><h2 className="text-5xl font-black text-slate-900 tracking-tighter">Billing Counter</h2><p className="text-slate-400 font-bold uppercase text-[11px] tracking-[0.3em] mt-2 underline decoration-blue-500 decoration-4 underline-offset-8">Arya Cement Agency Terminal</p></div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black uppercase tracking-widest mb-1 text-slate-400">Edit Bill Number</span>
                <input 
                  type="text" value={billNumber} onChange={(e) => setBillNumber(e.target.value)}
                  className="text-2xl font-mono font-black text-blue-600 bg-blue-50 px-6 py-3 rounded-2xl border-2 border-dashed border-blue-200 outline-none focus:border-blue-500 transition-all text-right shadow-sm w-56"
                />
              </div>
            </header>

            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden">
              <div className="p-12 bg-slate-50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="space-y-3 lg:col-span-2"><label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-400">Customer Selection</label>
                  <select className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-white font-bold text-slate-700 shadow-sm focus:border-blue-500 outline-none" value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
                    <option value="">-- Choose Profile --</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name} | {c.mobile}</option>)}
                  </select>
                </div>
                <div className="space-y-3 lg:col-span-2"><label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-400">Date Selection</label>
                  <input type="date" className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-white font-bold text-slate-700 shadow-sm focus:border-blue-500 outline-none" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
                </div>
                <div className="space-y-3 lg:col-span-2"><label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-400">Vehicle No (Optional)</label>
                  <input type="text" placeholder="UP 81 AT 1234" className="w-full p-4 rounded-2xl border-2 border-slate-100 font-bold uppercase focus:border-blue-500 outline-none shadow-sm" value={transportDetails.vehicleNo} onChange={(e) => setTransportDetails({...transportDetails, vehicleNo: e.target.value.toUpperCase()})} />
                </div>
                <div className="space-y-3 lg:col-span-2"><label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-400">Transport Agency (Optional)</label>
                  <input type="text" placeholder="Agency Name" className="w-full p-4 rounded-2xl border-2 border-slate-100 font-bold focus:border-blue-500 outline-none shadow-sm" value={transportDetails.transportName} onChange={(e) => setTransportDetails({...transportDetails, transportName: e.target.value})} />
                </div>
              </div>

              <div className="p-12">
                <table className="w-full mb-10">
                  <thead>
                    <tr className="text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b-2 border-slate-50"><th className="pb-8">Cement Item</th><th className="pb-8 text-center">Bags</th><th className="pb-8 text-center">Rate (₹)</th><th className="pb-8 text-right">Amount</th><th className="pb-8"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {billItems.map(item => (
                      <tr key={item.id}>
                        <td className="py-8"><select className="w-full p-4 border-2 border-slate-50 rounded-2xl font-black bg-slate-50/50 outline-none focus:border-blue-500" value={item.productId} onChange={(e) => setBillItems(billItems.map(i => i.id === item.id ? {...i, productId: e.target.value} : i))}>
                          <option value="">Choose Brand...</option>{inventory.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select></td>
                        <td className="py-8 px-4"><input type="number" className="w-24 p-4 border-2 border-slate-50 rounded-2xl text-center font-black" value={item.quantity} onChange={(e) => setBillItems(billItems.map(i => i.id === item.id ? {...i, quantity: parseInt(e.target.value) || 0} : i))} /></td>
                        <td className="py-8 px-4"><input type="number" placeholder="₹" className="w-32 p-4 border-2 border-blue-50 bg-blue-50/20 rounded-2xl font-black text-blue-700 text-center focus:border-blue-500 outline-none" value={item.rate || ''} onChange={(e) => setBillItems(billItems.map(i => i.id === item.id ? {...i, rate: parseFloat(e.target.value) || 0} : i))} /></td>
                        <td className="py-8 px-4 text-right font-black text-slate-900 text-2xl tracking-tighter">₹{(item.quantity * item.rate).toLocaleString()}</td>
                        <td className="py-8 pl-8 text-right"><button onClick={() => setBillItems(billItems.filter(i => i.id !== item.id))} className="p-3 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"><Trash2 size={22}/></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between items-start">
                  <button onClick={() => setBillItems([...billItems, { id: Date.now(), productId: '', quantity: 1, rate: 0 }])} className="px-8 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-slate-950/20 flex items-center gap-2"><Plus size={18}/> Add Another Product</button>
                  <div className="w-96 bg-slate-950 text-white p-10 rounded-[3rem] shadow-2xl space-y-4 border-t-4 border-blue-600">
                    <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-widest"><span>Taxable Net</span><span>₹{calculateTotals(billItems).subtotal.toLocaleString()}</span></div>
                    <div className="flex justify-between text-xs font-bold text-blue-400 uppercase italic tracking-widest"><span>CGST @ 9%</span><span>+ ₹{calculateTotals(billItems).cgst.toLocaleString()}</span></div>
                    <div className="flex justify-between text-xs font-bold text-blue-400 uppercase italic tracking-widest"><span>SGST @ 9%</span><span>+ ₹{calculateTotals(billItems).sgst.toLocaleString()}</span></div>
                    <div className="pt-6 border-t border-slate-800 flex justify-between items-end font-black"><span className="text-sm text-slate-400">FINAL TOTAL</span><span className="text-4xl tracking-tighter text-white">₹{calculateTotals(billItems).total.toLocaleString()}</span></div>
                  </div>
                </div>
              </div>
              <div className="p-12 bg-slate-50 flex justify-end">
                <button onClick={finalizeBill} disabled={isSaving} className="px-16 py-5 rounded-[2rem] bg-blue-600 text-white font-black text-lg shadow-2xl shadow-blue-600/30 flex items-center gap-4 hover:scale-[1.03] active:scale-[0.97] transition-all">
                  {isSaving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><Save size={24}/> Save & Print Bill</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. CUSTOMERS TAB */}
        {activeTab === 'customers' && (
          <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in duration-500">
            <header><h2 className="text-5xl font-black text-slate-900 tracking-tighter">Customer Management</h2><p className="text-slate-400 font-bold mt-2 uppercase text-xs tracking-widest">Register and edit client data</p></header>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-2xl h-fit sticky top-10">
                <h3 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3">{editingCustomer ? <Pencil size={24} className="text-blue-600"/> : <Plus size={24} className="text-blue-600"/>} {editingCustomer ? 'Update Profile' : 'New Registration'}</h3>
                <form onSubmit={handleCustomerAction} className="space-y-6">
                  <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Consumer Full Name</label>
                    <input name="name" required defaultValue={editingCustomer?.name} placeholder="e.g. Rahul Sharma" className="w-full p-4 rounded-2xl border-2 border-slate-50 bg-slate-50/50 outline-none font-bold focus:border-blue-500 shadow-sm" />
                  </div>
                  <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">WhatsApp Number</label>
                    <input name="mobile" required defaultValue={editingCustomer?.mobile} placeholder="10-digit Mobile" className="w-full p-4 rounded-2xl border-2 border-slate-50 bg-slate-50/50 outline-none font-bold focus:border-blue-500 shadow-sm" />
                  </div>
                  <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">GST Identification</label>
                    <input name="gstin" defaultValue={editingCustomer?.gstin} placeholder="GST Number (Optional)" className="w-full p-4 rounded-2xl border-2 border-slate-50 bg-slate-50/50 outline-none font-bold focus:border-blue-500 uppercase shadow-sm" />
                  </div>
                  <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Delivery Address</label>
                    <textarea name="address" required defaultValue={editingCustomer?.address} placeholder="Full Home/Office Address" className="w-full p-4 rounded-2xl border-2 border-slate-50 bg-slate-50/50 outline-none font-bold h-28 focus:border-blue-500 shadow-sm" />
                  </div>
                  <button type="submit" className="w-full py-5 bg-slate-950 text-white rounded-2xl font-black shadow-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-3">
                    <CheckCircle2 size={20}/> {editingCustomer ? 'Update Client' : 'Add to Directory'}
                  </button>
                  {editingCustomer && <button type="button" onClick={() => setEditingCustomer(null)} className="w-full py-2 text-slate-400 font-bold hover:text-red-500 uppercase text-[10px] tracking-widest transition-colors">Cancel Editing</button>}
                </form>
              </div>
              <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden">
                <table className="w-full text-left"><thead className="bg-slate-950 text-white/50 text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-900"><tr><th className="p-10">Consumer Identification</th><th className="p-10 text-right">Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{customers.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/50 transition-all group">
                      <td className="p-10"><div className="font-black text-slate-900 text-2xl tracking-tighter">{c.name}</div><div className="text-sm font-bold text-slate-500 mt-2 flex items-center gap-3"><Phone size={14} className="text-blue-600"/> {c.mobile} <span className="text-slate-300">|</span> <Hash size={14} className="text-blue-600"/> {c.gstin}</div></td>
                      <td className="p-10 text-right flex justify-end gap-3"><button onClick={() => { setEditingCustomer(c); window.scrollTo(0,0); }} className="p-4 text-slate-200 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all shadow-sm group-hover:scale-110"><Pencil size={22}/></button><button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', c.id))} className="p-4 text-slate-200 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all shadow-sm group-hover:scale-110"><Trash2 size={22}/></button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. MANAGE PRODUCTS TAB */}
        {activeTab === 'inventory' && (
          <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in duration-500">
            <header><h2 className="text-5xl font-black text-slate-900 tracking-tighter">Add Products</h2><p className="text-slate-400 font-bold mt-2 uppercase text-xs tracking-widest">Cement Brand Directory</p></header>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-2xl h-fit sticky top-10">
                <h3 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3"><Plus size={24} className="text-blue-600"/> Register Brand</h3>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), { name: e.target.itemName.value, hsnCode: e.target.itemHSN.value || '2523' });
                  e.target.reset();
                  alert("Brand Registered!");
                }} className="space-y-6">
                  <input name="itemName" required placeholder="Brand Name (e.g. UltraTech)" className="w-full p-4 rounded-2xl border-2 border-slate-50 bg-slate-50/50 outline-none font-bold focus:border-blue-500" />
                  <input name="itemHSN" placeholder="HSN Code (Default: 2523)" className="w-full p-4 rounded-2xl border-2 border-slate-50 bg-slate-50/50 outline-none font-bold focus:border-blue-500" />
                  <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-3"><Save size={20}/> Save Product</button>
                </form>
              </div>
              <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden">
                <table className="w-full text-left"><thead className="bg-slate-950 text-white/50 text-[10px] font-black uppercase tracking-widest border-b border-slate-900"><tr><th className="p-10">Cement Brand / Product Name</th><th className="p-10 text-right">Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{inventory.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/40 transition-all group">
                      <td className="p-10"><div className="font-black text-slate-900 text-2xl tracking-tighter">{item.name}</div><div className="text-[10px] font-black text-slate-400 mt-2 uppercase tracking-widest font-mono">HSN Code: {item.hsnCode}</div></td>
                      <td className="p-10 text-right flex justify-end"><button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id))} className="p-4 text-slate-200 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all shadow-sm group-hover:scale-110"><Trash2 size={22}/></button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 4. HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500">
            <header className="flex justify-between items-center"><h2 className="text-5xl font-black text-slate-900 tracking-tighter">Invoicing Records</h2><div className="relative group shadow-xl rounded-2xl"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600" size={20}/><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Find by Bill # or Name..." className="pl-12 pr-8 py-5 rounded-2xl border border-slate-200 outline-none w-96 font-bold shadow-sm focus:ring-4 focus:ring-blue-500/5 transition-all" /></div></header>
            <div className="bg-white rounded-[3rem] border border-slate-200 shadow-2xl overflow-hidden">
              <table className="w-full text-left"><thead className="bg-slate-950 text-white/50 text-[10px] font-black uppercase tracking-[0.2em]"><tr><th className="p-10">Bill Identification</th><th className="p-10 text-right">Invoice Amount</th><th className="p-10 text-center">Export Tools</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{bills.filter(b => b.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) || b.billNumber?.toLowerCase().includes(searchQuery.toLowerCase())).sort((a,b) => b.timestamp - a.timestamp).map(bill => (
                  <tr key={bill.id} className="hover:bg-slate-50/50 cursor-pointer group transition-all" onClick={() => setPreviewBill(bill)}>
                    <td className="p-10"><div className="font-black text-blue-600 font-mono text-2xl tracking-tighter underline underline-offset-8 decoration-blue-200 decoration-4">#{bill.billNumber}</div><div className="font-black text-slate-900 text-xl mt-4">{bill.customerName}</div><div className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-widest font-mono italic flex items-center gap-2"><Calendar size={10}/> {new Date(bill.date).toLocaleDateString('en-IN')} | <Store size={10}/> {bill.folderPath}</div></td>
                    <td className="p-10 text-right font-black text-slate-950 text-3xl tracking-tighter">₹{bill.totals.total.toLocaleString()}</td>
                    <td className="p-10 text-center flex justify-center gap-3 items-center h-40" onClick={e => e.stopPropagation()}><button onClick={() => setPreviewBill(bill)} className="p-5 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-all shadow-md" title="Preview Bill"><Eye size={24}/></button><button onClick={() => generatePDF(bill)} className="p-5 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-md" title="Download PDF"><Download size={24}/></button><button onClick={() => sendWhatsApp(bill)} className="p-5 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-md shadow-emerald-500/20" title="Send WhatsApp"><MessageCircle size={24}/></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. AGENCY PROFILE SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500">
            <header><h2 className="text-5xl font-black text-slate-900 tracking-tighter">Agency Profile</h2><p className="text-slate-400 font-bold mt-2 uppercase text-xs tracking-widest underline decoration-blue-500 underline-offset-8">Configure Official Bill Branding</p></header>
            <div className="bg-white p-12 rounded-[3rem] border border-slate-200 shadow-2xl">
              <form onSubmit={handleUpdateAgency} className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Agency Display Name</label>
                  <input name="name" defaultValue={agencyInfo.name} required className="w-full p-5 rounded-2xl border-2 border-slate-50 bg-slate-50/50 outline-none focus:border-blue-500 font-black text-slate-800 text-lg shadow-sm" />
                </div>
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Agency GSTIN</label>
                  <input name="gstin" defaultValue={agencyInfo.gstin} required className="w-full p-5 rounded-2xl border-2 border-slate-50 bg-slate-50/50 outline-none focus:border-blue-500 font-black text-slate-800 text-lg uppercase shadow-sm" />
                </div>
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Public Contact No</label>
                  <input name="phone" defaultValue={agencyInfo.phone} required className="w-full p-5 rounded-2xl border-2 border-slate-50 bg-slate-50/50 outline-none focus:border-blue-500 font-black text-slate-800 text-lg shadow-sm" />
                </div>
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Agency Tagline / Dealer Info</label>
                  <input name="tagline" defaultValue={agencyInfo.tagline} required className="w-full p-5 rounded-2xl border-2 border-slate-50 bg-slate-50/50 outline-none focus:border-blue-500 font-bold text-slate-600 shadow-sm" />
                </div>
                <div className="space-y-2 md:col-span-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Official Office Address</label>
                  <textarea name="address" defaultValue={agencyInfo.address} required className="w-full p-5 rounded-2xl border-2 border-slate-50 bg-slate-50/50 outline-none font-bold text-slate-700 h-32 focus:border-blue-500 shadow-sm" />
                </div>
                <div className="md:col-span-2 pt-6">
                  <button type="submit" className="px-14 py-5 bg-blue-600 text-white rounded-[2rem] font-black text-lg shadow-2xl shadow-blue-600/30 hover:bg-blue-700 transition-all flex items-center gap-4">
                    <Save size={24}/> Update Official Profile
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;
