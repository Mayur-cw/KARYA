import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
const Home=lazy(async()=>({default:()=> <section className="panel"><h1>Starter is running</h1><p>Replace this screen using page inventory and element contracts. Authentication is not implemented in the starter.</p></section>}));
function NotFound(){return <section className="panel"><h1>Page unavailable</h1><Link to="/">Return home</Link></section>;}
export default function App(){return <BrowserRouter><a className="skip" href="#content">Skip to content</a><header className="shell"><strong>Function-first starter</strong><nav aria-label="Primary"><Link to="/">Home</Link></nav></header><main id="content"><Suspense fallback={<p role="status">Loading page</p>}><Routes><Route path="/" element={<Home/>}/><Route path="*" element={<NotFound/>}/></Routes></Suspense></main><footer className="shell">Accessible baseline — replace per Blueprint</footer></BrowserRouter>;}
