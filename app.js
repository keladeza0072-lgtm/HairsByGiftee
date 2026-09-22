import { db } from "./firebase-client.js";
import {
  collection, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const WA = "2347087861972";
const fallback = {
  products: [
    {id:"p1",name:"Luxe Bone Straight",price:165000,salePrice:130000,detail:'22” • 200% • HD Lace',category:"Bone Straight",hotDeal:true,bestseller:true,available:true,image:"https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=85"},
    {id:"p2",name:"Dreamy Curls",price:182000,salePrice:149000,detail:'20” • 180% • HD Lace',category:"Curly",hotDeal:true,bestseller:true,available:true,image:"https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=900&q=85"},
    {id:"p3",name:"Classic Bob",price:145000,salePrice:119000,detail:'14” • 180% • HD Lace',category:"Bob Wigs",hotDeal:true,bestseller:true,available:true,image:"https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=85"},
    {id:"p4",name:"Piano Highlight",price:205000,detail:'22” • 200% • HD Lace',category:"Coloured Wigs",hotDeal:false,bestseller:true,available:true,image:"https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=900&q=85"}
  ],
  reviews: [
    {id:"r1",name:"Amara T.",rating:5,quote:"The hair is so soft and true to length. I keep getting compliments.",published:true,image:"https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=500&q=80"},
    {id:"r2",name:"Chinaza O.",rating:5,quote:"This is my third order and the quality is always top tier.",published:true,image:"https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80"},
    {id:"r3",name:"Ifunanya E.",rating:5,quote:"It looks so natural and the install was simple. I love it.",published:true,image:"https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=500&q=80"}
  ],
  announcements: [{id:"a1",message:"Global delivery available • 3–6 day nationwide shipping",active:true}]
};

const state = { products: fallback.products, reviews: fallback.reviews, announcements: fallback.announcements };
const rates={NGN:{s:"₦",r:1,d:0},USD:{s:"$",r:.00063,d:2},GBP:{s:"£",r:.00047,d:2},GHS:{s:"GH₵",r:.0062,d:2},XAF:{s:"FCFA ",r:.36,d:0}};
let currency=localStorage.getItem("hbg_currency")||"NGN";
const money=(v)=>{const x=rates[currency]||rates.NGN;return x.s+(Number(v)*x.r).toLocaleString(undefined,{minimumFractionDigits:x.d,maximumFractionDigits:x.d})};
const wa=(p,price)=>"https://wa.me/"+WA+"?text="+encodeURIComponent("Hi HairsByGiftee ❤️\nI’m interested in the "+p.name+".\n"+(p.detail||"")+"\nPrice: ₦"+Number(price).toLocaleString("en-NG")+"\n\nIs it currently available?");

function productCard(p,deal){
  const final=deal&&p.salePrice?p.salePrice:p.price;
  const pct=deal&&p.salePrice?Math.round((1-p.salePrice/p.price)*100):0;
  return `<article class="product"><div class="product-image"><img src="${p.image}" alt="${p.name}" loading="lazy">${pct?`<span class="badge">${pct}% OFF</span>`:""}</div><div class="product-copy"><h3>${p.name}</h3><div class="product-meta">${p.detail||""}</div><div class="price"><strong>${money(final)}</strong>${pct?`<del>${money(p.price)}</del>`:""}</div><a class="buy" target="_blank" rel="noreferrer" href="${wa(p,final)}">Buy Now</a></div></article>`;
}

function render(){
  const products=state.products.filter(p=>p.available!==false);
  const reviews=state.reviews.filter(r=>r.published!==false);
  const ann=state.announcements.find(a=>a.active);
  document.querySelector("#announcement").textContent=(ann||fallback.announcements[0]).message;
  const deals=products.filter(p=>p.hotDeal).slice(0,3);
  document.querySelector("#dealGrid").innerHTML=deals.length?deals.map(p=>productCard(p,true)).join(""):'<div class="empty">No hot deals right now.</div>';
  const best=products.filter(p=>p.bestseller).slice(0,4);
  document.querySelector("#bestGrid").innerHTML=best.length?best.map(p=>productCard(p,false)).join(""):'<div class="empty">Bestsellers coming soon.</div>';
  document.querySelector("#reviewGrid").innerHTML=reviews.slice(0,3).map(r=>`<article class="review">${r.image?`<img src="${r.image}" alt="${r.name}" loading="lazy">`:""}<div><div class="stars">${"★".repeat(r.rating||5)}</div><p>“${r.quote}”</p><b>${r.name}</b></div></article>`).join("");
}

function liveCollection(name){
  onSnapshot(collection(db,name),(snap)=>{
    if(!snap.empty){
      state[name]=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      render();
    }
  },()=>render());
}

document.querySelector("#currency").value=currency;
document.querySelector("#currency").addEventListener("change",e=>{currency=e.target.value;localStorage.setItem("hbg_currency",currency);render()});
render();
["products","reviews","announcements"].forEach(liveCollection);
