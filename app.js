import { db } from "./firebase-client.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const WA="2347087861972";
const fallback={
  products:[
    {id:"p1",name:"Luxe Bone Straight",price:165000,salePrice:130000,detail:'22” • 200% • HD Lace',category:"Bone Straight",hotDeal:true,bestseller:true,available:true,image:"https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85"},
    {id:"p2",name:"Dreamy Curls",price:182000,salePrice:149000,detail:'20” • 180% • HD Lace',category:"Curly",hotDeal:true,bestseller:true,available:true,image:"https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=900&q=85"},
    {id:"p3",name:"Classic Bob",price:145000,salePrice:119000,detail:'14” • 180% • HD Lace',category:"Bob Wigs",hotDeal:true,bestseller:true,available:true,image:"https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=900&q=85"},
    {id:"p4",name:"Piano Highlight",price:205000,detail:'22” • 200% • HD Lace',category:"Coloured Wigs",hotDeal:false,bestseller:true,available:true,image:"https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&w=900&q=85"}
  ],
  reviews:[
    {id:"r1",name:"Amara T.",rating:5,quote:"The hair is so soft and true to length. I keep getting compliments.",published:true,image:"https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=500&q=80"},
    {id:"r2",name:"Chinaza O.",rating:5,quote:"This is my third order and the quality is always top tier.",published:true,image:""},
    {id:"r3",name:"Ifunanya E.",rating:5,quote:"It looks so natural and the install was simple. I love it.",published:true,image:"https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=500&q=80"}
  ],
  announcements:[{id:"a1",message:"Global delivery available • 3–6 day nationwide shipping",active:true}]
};

const state={products:fallback.products,reviews:fallback.reviews,announcements:fallback.announcements};
const rates={NGN:{s:"₦",r:1,d:0},USD:{s:"$",r:.00063,d:2},GBP:{s:"£",r:.00047,d:2},GHS:{s:"GH₵",r:.0062,d:2},XAF:{s:"FCFA ",r:.36,d:0}};
let currency=localStorage.getItem("hbg_currency")||"NGN";
let activeCategory="All";
let searchTerm="";
let reviewIndex=0;
let reviewTimer=null;

const esc=(v="")=>String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const money=v=>{const x=rates[currency]||rates.NGN;return x.s+(Number(v)*x.r).toLocaleString(undefined,{minimumFractionDigits:x.d,maximumFractionDigits:x.d})};
const imagesFor=p=>{
  const list=Array.isArray(p.images)?p.images.filter(Boolean):[];
  if(p.image&&!list.includes(p.image))list.unshift(p.image);
  return list.length?list:["https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80"];
};
const wa=(p,price)=>"https://wa.me/"+WA+"?text="+encodeURIComponent("Hi HairsByGiftee ❤️\nI’m interested in the "+p.name+".\n"+(p.detail||"")+"\nPrice: ₦"+Number(price).toLocaleString("en-NG")+"\n\nIs it currently available?");

function productCard(p,deal=false){
  const final=deal&&p.salePrice?p.salePrice:p.price;
  const pct=deal&&p.salePrice&&p.price?Math.round((1-p.salePrice/p.price)*100):0;
  const img=imagesFor(p)[0];
  return `<article class="product product-click" data-product-id="${esc(p.id)}" tabindex="0" role="button" aria-label="View ${esc(p.name)} details">
    <div class="product-image">
      <img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy">
      ${pct?`<span class="badge">${pct}% OFF</span>`:""}
      ${p.bestseller?'<span class="badge badge-best">Bestseller</span>':""}
    </div>
    <div class="product-copy">
      <h3>${esc(p.name)}</h3>
      <div class="product-meta">${esc(p.detail||p.category||"")}</div>
      <div class="price"><strong>${money(final)}</strong>${pct?`<del>${money(p.price)}</del>`:""}</div>
      <span class="view-details">View details →</span>
    </div>
  </article>`;
}

function filteredProducts(){
  return state.products.filter(p=>p.available!==false).filter(p=>{
    const categoryOk=activeCategory==="All"||p.category===activeCategory;
    const hay=(p.name+" "+(p.detail||"")+" "+(p.category||"")).toLowerCase();
    return categoryOk&&(!searchTerm||hay.includes(searchTerm));
  });
}

function renderFilters(){
  const categories=["All",...new Set(state.products.filter(p=>p.available!==false).map(p=>p.category).filter(Boolean))];
  document.querySelector("#categoryFilters").innerHTML=categories.map(c=>`<button type="button" class="${c===activeCategory?"active":""}" data-category="${esc(c)}">${esc(c)}</button>`).join("");
  document.querySelectorAll("[data-category]").forEach(btn=>btn.onclick=()=>{activeCategory=btn.dataset.category;renderShop()});
}

function wireCards(){
  document.querySelectorAll(".product-click").forEach(card=>{
    const open=()=>openProduct(card.dataset.productId);
    card.onclick=open;
    card.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}};
  });
}

function renderShop(){
  const products=filteredProducts();
  document.querySelector("#shopCount").textContent=products.length+" wig"+(products.length===1?"":"s");
  document.querySelector("#shopGrid").innerHTML=products.length?products.map(p=>productCard(p,false)).join(""):'<div class="empty">No wigs match your search.</div>';
  renderFilters();
  wireCards();
}

function renderDeals(){
  const products=state.products.filter(p=>p.available!==false&&p.hotDeal).slice(0,3);
  document.querySelector("#dealGrid").innerHTML=products.length?products.map(p=>productCard(p,true)).join(""):'<div class="empty">No hot deals right now.</div>';
  wireCards();
}

function reviewHtml(r){
  const photo=r.image?`<div class="review-photo"><img src="${esc(r.image)}" alt="${esc(r.name)}" loading="lazy"></div>`:"";
  return `<article class="review-slide ${r.image?"has-photo":"text-only"}">
    ${photo}
    <div class="review-body">
      <div class="stars">${"★".repeat(Number(r.rating)||5)}</div>
      <p>“${esc(r.quote||"")}”</p>
      <b>${esc(r.name||"Customer")}</b>
    </div>
  </article>`;
}

function renderReview(){
  const reviews=state.reviews.filter(r=>r.published!==false);
  if(!reviews.length){
    document.querySelector("#reviewSlider").innerHTML='<div class="empty">Customer reviews coming soon.</div>';
    document.querySelector("#reviewDots").innerHTML="";
    return;
  }
  reviewIndex=((reviewIndex%reviews.length)+reviews.length)%reviews.length;
  document.querySelector("#reviewSlider").innerHTML=reviewHtml(reviews[reviewIndex]);
  document.querySelector("#reviewDots").innerHTML=reviews.map((_,i)=>`<button type="button" class="${i===reviewIndex?"active":""}" data-review-dot="${i}" aria-label="Show review ${i+1}"></button>`).join("");
  document.querySelectorAll("[data-review-dot]").forEach(btn=>btn.onclick=()=>{reviewIndex=Number(btn.dataset.reviewDot);renderReview();restartReviewTimer()});
}

function restartReviewTimer(){
  clearInterval(reviewTimer);
  const reviews=state.reviews.filter(r=>r.published!==false);
  if(reviews.length>1)reviewTimer=setInterval(()=>{reviewIndex++;renderReview()},5000);
}

function openProduct(id){
  const p=state.products.find(x=>String(x.id)===String(id));
  if(!p)return;
  const imgs=imagesFor(p);
  const deal=p.hotDeal&&p.salePrice;
  const final=deal?p.salePrice:p.price;
  document.querySelector("#modalImage").src=imgs[0];
  document.querySelector("#modalImage").alt=p.name;
  document.querySelector("#modalTitle").textContent=p.name;
  document.querySelector("#modalCategory").textContent=p.category||"";
  document.querySelector("#modalDetail").textContent=p.detail||"";
  document.querySelector("#modalPrice").innerHTML=`<strong>${money(final)}</strong>${deal?`<del>${money(p.price)}</del>`:""}`;
  document.querySelector("#modalStock").textContent=p.available===false?"Sold out":"Available";
  document.querySelector("#modalBuy").href=wa(p,final);
  document.querySelector("#modalThumbs").innerHTML=imgs.length>1?imgs.map((src,i)=>`<button type="button" class="${i===0?"active":""}" data-thumb="${i}"><img src="${esc(src)}" alt=""></button>`).join(""):"";
  document.querySelectorAll("[data-thumb]").forEach(btn=>btn.onclick=()=>{
    document.querySelector("#modalImage").src=imgs[Number(btn.dataset.thumb)];
    document.querySelectorAll("[data-thumb]").forEach(x=>x.classList.toggle("active",x===btn));
  });
  const modal=document.querySelector("#productModal");
  modal.hidden=false;
  document.body.classList.add("modal-open");
  document.querySelector("#modalClose").focus();
}

function closeModal(){
  document.querySelector("#productModal").hidden=true;
  document.body.classList.remove("modal-open");
}

function render(){
  const ann=state.announcements.find(a=>a.active);
  document.querySelector("#announcement").textContent=(ann||fallback.announcements[0]).message;
  renderDeals();
  renderShop();
  renderReview();
  restartReviewTimer();
}

function liveCollection(name){
  onSnapshot(collection(db,name),snap=>{
    if(!snap.empty){
      state[name]=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      render();
    }
  },()=>render());
}

document.querySelector("#currency").value=currency;
document.querySelector("#currency").addEventListener("change",e=>{currency=e.target.value;localStorage.setItem("hbg_currency",currency);render()});

const searchBar=document.querySelector("#searchBar");
const searchInput=document.querySelector("#searchInput");
document.querySelector("#searchToggle").onclick=()=>{searchBar.hidden=false;setTimeout(()=>searchInput.focus(),0)};
document.querySelector("#searchClose").onclick=()=>{searchBar.hidden=true;searchInput.value="";searchTerm="";renderShop()};
searchInput.addEventListener("input",e=>{searchTerm=e.target.value.trim().toLowerCase();activeCategory="All";renderShop();document.querySelector("#shop").scrollIntoView({behavior:"smooth",block:"start"})});

document.querySelector("#modalClose").onclick=closeModal;
document.querySelector("#modalBackdrop").onclick=closeModal;
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!document.querySelector("#productModal").hidden)closeModal()});
document.querySelector("#reviewPrev").onclick=()=>{reviewIndex--;renderReview();restartReviewTimer()};
document.querySelector("#reviewNext").onclick=()=>{reviewIndex++;renderReview();restartReviewTimer()};
const reviewSlider=document.querySelector("#reviewSlider");
reviewSlider.addEventListener("mouseenter",()=>clearInterval(reviewTimer));
reviewSlider.addEventListener("mouseleave",restartReviewTimer);
reviewSlider.addEventListener("focusin",()=>clearInterval(reviewTimer));
reviewSlider.addEventListener("focusout",restartReviewTimer);

render();
["products","reviews","announcements"].forEach(liveCollection);
