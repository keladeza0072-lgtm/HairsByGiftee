import { db } from "./firebase-client.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const WA="2347087861972";

const state={products:[],hotDeals:[],reviews:[],announcements:[]};
const loading={products:true,hotDeals:true,reviews:true,announcements:true};
const loadError={products:false,hotDeals:false,reviews:false,announcements:false};
let activeCategory="All";
let searchTerm="";
let reviewIndex=0;
let reviewTimer=null;

const SUPPORTED_CURRENCIES=["NGN","USD","GBP","GHS"];
const CURRENCY_LOCALES={NGN:"en-NG",USD:"en-US",GBP:"en-GB",GHS:"en-GH"};
const FX_CACHE_KEY="hbg_fx_rates_v1";
const FX_CURRENCY_KEY="hbg_currency";
const FX_MAX_AGE=24*60*60*1000;
let selectedCurrency=SUPPORTED_CURRENCIES.includes(localStorage.getItem(FX_CURRENCY_KEY))
  ?localStorage.getItem(FX_CURRENCY_KEY)
  :"NGN";
let fxRates={NGN:1};
let fxCacheSavedAt=0;

try{
  const cached=JSON.parse(localStorage.getItem(FX_CACHE_KEY)||"null");
  if(cached&&cached.rates){
    fxRates={NGN:1,...cached.rates};
    fxCacheSavedAt=Number(cached.savedAt||0);
  }
}catch{}

const money=v=>{
  const source=Number(v||0);
  const rate=selectedCurrency==="NGN"?1:Number(fxRates[selectedCurrency]||0);
  const currency=rate>0?selectedCurrency:"NGN";
  const amount=currency==="NGN"?source:source*rate;
  return new Intl.NumberFormat(CURRENCY_LOCALES[currency]||"en-NG",{
    style:"currency",
    currency,
    maximumFractionDigits:currency==="NGN"?0:2
  }).format(amount);
};
const esc=(v="")=>String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const productImages=p=>{
  const imgs=Array.isArray(p.images)?p.images.filter(Boolean):[];
  if(p.image&&!imgs.includes(p.image))imgs.unshift(p.image);
  return imgs;
};
const productImageMarkup=p=>{
  const src=productImages(p)[0];
  return src
    ? `<img src="${esc(src)}" alt="${esc(p.name||"Wig")}" loading="lazy">`
    : '<div class="product-image-placeholder" aria-hidden="true"></div>';
};
const whatsapp=(p,price)=>"https://wa.me/"+WA+"?text="+encodeURIComponent(
  "Hi HairsByGiftee ❤️\nI'm interested in the "+p.name+".\n"+(p.detail||"")+"\nPrice: ₦"+Number(price).toLocaleString("en-NG")+"\n\nIs it currently available?"
);

async function loadFxRates(){
  const currencySelect=document.querySelector("#currencySelect");
  if(currencySelect)currencySelect.value=selectedCurrency;

  const cacheFresh=fxCacheSavedAt&&Date.now()-fxCacheSavedAt<FX_MAX_AGE;
  if(cacheFresh){
    render();
    return;
  }

  try{
    const res=await fetch("https://open.er-api.com/v6/latest/NGN",{cache:"no-store"});
    const data=await res.json();
    if(!res.ok||data.result!=="success"||!data.rates)throw new Error("FX_UNAVAILABLE");

    fxRates={
      NGN:1,
      USD:Number(data.rates.USD||0),
      GBP:Number(data.rates.GBP||0),
      GHS:Number(data.rates.GHS||0)
    };
    fxCacheSavedAt=Date.now();
    localStorage.setItem(FX_CACHE_KEY,JSON.stringify({
      savedAt:fxCacheSavedAt,
      updatedAt:data.time_last_update_utc||"",
      rates:fxRates
    }));
  }catch{
    if(selectedCurrency!=="NGN"&&!Number(fxRates[selectedCurrency]||0)){
      selectedCurrency="NGN";
      localStorage.setItem(FX_CURRENCY_KEY,selectedCurrency);
      if(currencySelect)currencySelect.value="NGN";
    }
  }

  render();
}

function visibleProducts(){
  return state.products.filter(p=>p.available!==false).filter(p=>{
    const categoryOk=activeCategory==="All"||String(p.category||"")===activeCategory;
    const hay=(String(p.name||"")+" "+String(p.category||"")+" "+String(p.detail||"")).toLowerCase();
    return categoryOk&&(!searchTerm||hay.includes(searchTerm));
  });
}

function productCard(p){
  const badges=[
    p.bestseller?'<span class="badge badge-best">Bestseller</span>':""
  ].join("");
  return `<article class="product" data-product-id="${esc(p.id)}" tabindex="0" role="button">
    <div class="product-image">
      ${productImageMarkup(p)}
      ${badges}
    </div>
    <div class="product-copy">
      <h3>${esc(p.name)}</h3>
      <div class="product-meta">${esc(p.detail||"")}</div>
      <div class="price"><strong>${money(p.price)}</strong></div>
      <span class="view-details">View Details</span>
    </div>
  </article>`;
}

function renderFilters(){
  const categories=["All",...new Set(state.products.filter(p=>p.available!==false).map(p=>p.category).filter(Boolean))];
  document.querySelector("#categoryFilters").innerHTML=categories.map(c=>`<button type="button" class="${c===activeCategory?"active":""}" data-category="${esc(c)}">${esc(c)}</button>`).join("");
  document.querySelectorAll("[data-category]").forEach(btn=>btn.onclick=()=>{
    activeCategory=btn.dataset.category;
    renderShop();
  });
}

function renderShop(){
  if(loading.products){
    document.querySelector("#categoryFilters").innerHTML="";
    document.querySelector("#shopGrid").innerHTML=Array.from({length:4},()=>'<article class="product product-skeleton" aria-hidden="true"><div class="product-image skeleton-block"></div><div class="product-copy"><div class="skeleton-line skeleton-title"></div><div class="skeleton-line"></div><div class="skeleton-line skeleton-price"></div></div></article>').join("");
    return;
  }
  if(loadError.products){
    document.querySelector("#categoryFilters").innerHTML="";
    document.querySelector("#shopGrid").innerHTML='<div class="empty">Unable to load wigs right now. Please refresh.</div>';
    return;
  }
  const products=visibleProducts();
  document.querySelector("#shopGrid").innerHTML=products.length?products.map(productCard).join(""):'<div class="empty">No wigs found.</div>';
  renderFilters();
  wireProducts();
}

function dealCard(d){
  return `<article class="deal-card" data-deal-id="${esc(d.id)}" tabindex="0" role="button">
    <div class="deal-image">
      ${productImageMarkup(d)}
      <span class="deal-badge">Hot Deal</span>
    </div>
    <div class="deal-copy">
      <h3>${esc(d.name)}</h3>
      <p class="deal-description">${esc(d.detail||"")}</p>
      <div class="deal-price"><strong>${money(d.price)}</strong></div>
      <span class="deal-view">View Deal</span>
    </div>
  </article>`;
}

function renderDeals(){
  const section=document.querySelector(".deals-section");
  const rail=document.querySelector("#dealRail");
  if(!section||!rail)return;
  if(loading.hotDeals||loadError.hotDeals){section.hidden=true;rail.innerHTML="";return;}
  const deals=state.hotDeals.filter(d=>d.available!==false);
  section.hidden=!deals.length;
  if(!deals.length){rail.innerHTML="";return;}
  rail.innerHTML=deals.map(dealCard).join("");
  wireDeals();
}

function wireDeals(){
  document.querySelectorAll("[data-deal-id]").forEach(card=>{
    const open=()=>openDeal(card.dataset.dealId);
    card.onclick=open;
    card.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}};
  });
}

function setModalImages(item){
  const imgs=productImages(item);
  const modalImage=document.querySelector("#modalImage");
  if(imgs.length){
    modalImage.src=imgs[0];
    modalImage.alt=item.name||"";
    modalImage.hidden=false;
  }else{
    modalImage.removeAttribute("src");
    modalImage.alt="";
    modalImage.hidden=true;
  }
  document.querySelector("#modalThumbs").innerHTML=imgs.length>1?imgs.map((src,i)=>`<button type="button" class="${i===0?"active":""}" data-thumb="${i}"><img src="${esc(src)}" alt=""></button>`).join(""):"";
  document.querySelectorAll("[data-thumb]").forEach(btn=>btn.onclick=()=>{
    modalImage.src=imgs[Number(btn.dataset.thumb)];
    document.querySelectorAll("[data-thumb]").forEach(x=>x.classList.toggle("active",x===btn));
  });
}

function openDeal(id){
  const d=state.hotDeals.find(x=>String(x.id)===String(id));
  if(!d)return;
  setModalImages(d);
  document.querySelector("#modalTitle").textContent=d.name||"Hot Deal";
  document.querySelector("#modalCategory").textContent="HOT DEAL";
  document.querySelector("#modalDetail").textContent=d.detail||"";
  document.querySelector("#modalPrice").innerHTML=`<strong>${money(d.price)}</strong>`;
  document.querySelector("#modalStock").textContent=d.available===false?"Offer unavailable":"Offer available";
  document.querySelector("#modalBuy").textContent="Claim deal on WhatsApp";
  document.querySelector("#modalBuy").href=whatsapp(d,d.price);
  document.querySelector("#productModal").hidden=false;
  document.body.classList.add("modal-open");
}

function wireProducts(){
  document.querySelectorAll("[data-product-id]").forEach(card=>{
    const open=()=>openProduct(card.dataset.productId);
    card.onclick=open;
    card.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}};
  });
}

function openProduct(id){
  const p=state.products.find(x=>String(x.id)===String(id));
  if(!p)return;
  setModalImages(p);
  document.querySelector("#modalTitle").textContent=p.name;
  document.querySelector("#modalCategory").textContent=p.category||"";
  document.querySelector("#modalDetail").textContent=p.detail||"";
  document.querySelector("#modalPrice").innerHTML=`<strong>${money(p.price)}</strong>`;
  document.querySelector("#modalStock").textContent=p.available===false?"Sold out":"Available";
  document.querySelector("#modalBuy").textContent="Buy on WhatsApp";
  document.querySelector("#modalBuy").href=whatsapp(p,p.price);
  document.querySelector("#productModal").hidden=false;
  document.body.classList.add("modal-open");
}

function closeModal(){
  document.querySelector("#productModal").hidden=true;
  document.body.classList.remove("modal-open");
}

function reviewCard(r){
  const image=r.image?`<img src="${esc(r.image)}" alt="${esc(r.name)}">`:'';
  return `<article class="review-card ${r.image?"with-photo":"no-photo"}">
    ${image}
    <div>
      <div class="stars">${"★".repeat(Number(r.rating)||5)}</div>
      <p>${esc(r.quote||"")}</p>
      <b>– ${esc(r.name||"Customer")}</b>
    </div>
  </article>`;
}

function renderReview(){
  if(loading.reviews){
    document.querySelector("#reviewSlider").innerHTML='<div class="review-card no-photo"><div><p>Loading customer reviews…</p></div></div>';
    document.querySelector("#reviewDots").innerHTML="";
    return;
  }
  if(loadError.reviews){
    document.querySelector("#reviewSlider").innerHTML='<div class="review-card no-photo"><div><p>Customer reviews are temporarily unavailable.</p></div></div>';
    document.querySelector("#reviewDots").innerHTML="";
    return;
  }
  const reviews=state.reviews.filter(r=>r.published!==false);
  if(!reviews.length){
    document.querySelector("#reviewSlider").innerHTML='<div class="review-card no-photo"><div><p>Reviews coming soon.</p></div></div>';
    document.querySelector("#reviewDots").innerHTML="";
    return;
  }
  reviewIndex=((reviewIndex%reviews.length)+reviews.length)%reviews.length;
  document.querySelector("#reviewSlider").innerHTML=reviewCard(reviews[reviewIndex]);
  document.querySelector("#reviewDots").innerHTML=reviews.map((_,i)=>`<button type="button" class="${i===reviewIndex?"active":""}" data-review="${i}" aria-label="Show review ${i+1}"></button>`).join("");
  document.querySelectorAll("[data-review]").forEach(btn=>btn.onclick=()=>{
    reviewIndex=Number(btn.dataset.review);
    renderReview();
    restartReviews();
  });
}

function restartReviews(){
  clearInterval(reviewTimer);
  const reviews=state.reviews.filter(r=>r.published!==false);
  if(reviews.length>1)reviewTimer=setInterval(()=>{reviewIndex++;renderReview()},5000);
}

function renderAnnouncement(){
  const bar=document.querySelector("#announcementBar");
  const text=document.querySelector("#announcementText");
  if(!bar||!text)return;
  if(loading.announcements||loadError.announcements){bar.hidden=true;return;}
  const announcement=state.announcements.find(a=>a.active!==false&&String(a.message||"").trim());
  if(!announcement){bar.hidden=true;text.textContent="";return;}
  text.textContent=announcement.message;
  bar.hidden=false;
}

function render(){
  renderAnnouncement();
  renderShop();
  renderDeals();
  renderReview();
  restartReviews();
}

function watch(name){
  onSnapshot(collection(db,name),snap=>{
    state[name]=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    loading[name]=false;
    loadError[name]=false;
    render();
  },()=>{
    loading[name]=false;
    loadError[name]=true;
    render();
  });
}

const currencySelect=document.querySelector("#currencySelect");
if(currencySelect){
  currencySelect.value=selectedCurrency;
  currencySelect.addEventListener("change",()=>{
    const next=currencySelect.value;
    selectedCurrency=SUPPORTED_CURRENCIES.includes(next)?next:"NGN";
    localStorage.setItem(FX_CURRENCY_KEY,selectedCurrency);
    render();
  });
}

const menuToggle=document.querySelector("#menuToggle");
const navMenu=document.querySelector("#navMenu");
function closeMenu(){
  if(!menuToggle||!navMenu)return;
  navMenu.hidden=true;
  menuToggle.setAttribute("aria-expanded","false");
  menuToggle.setAttribute("aria-label","Open menu");
}
if(menuToggle&&navMenu){
  menuToggle.onclick=e=>{
    e.stopPropagation();
    const opening=navMenu.hidden;
    navMenu.hidden=!opening;
    menuToggle.setAttribute("aria-expanded",String(opening));
    menuToggle.setAttribute("aria-label",opening?"Close menu":"Open menu");
  };
  navMenu.addEventListener("click",e=>e.stopPropagation());
  navMenu.querySelectorAll("a").forEach(a=>a.addEventListener("click",closeMenu));
  document.addEventListener("click",closeMenu);
}

const searchBar=document.querySelector("#searchBar");
const searchInput=document.querySelector("#searchInput");
document.querySelector("#searchToggle").onclick=()=>{searchBar.hidden=false;setTimeout(()=>searchInput.focus(),0)};
document.querySelector("#searchClose").onclick=()=>{searchBar.hidden=true;searchInput.value="";searchTerm="";activeCategory="All";renderShop()};
searchInput.oninput=e=>{searchTerm=e.target.value.trim().toLowerCase();activeCategory="All";renderShop();};

const dealsToggle=document.querySelector("#dealsToggle");
if(dealsToggle)dealsToggle.onclick=()=>{
  const rail=document.querySelector("#dealRail");
  const expanded=rail.classList.toggle("expanded");
  dealsToggle.textContent=expanded?"Show less":"View all deals";
  dealsToggle.setAttribute("aria-expanded",String(expanded));
};

document.querySelector("#reviewPrev").onclick=()=>{reviewIndex--;renderReview();restartReviews()};
document.querySelector("#reviewNext").onclick=()=>{reviewIndex++;renderReview();restartReviews()};
document.querySelector("#modalClose").onclick=closeModal;
document.querySelector("#modalBackdrop").onclick=closeModal;
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeModal();closeMenu()}});

render();
loadFxRates();
watch("products");
watch("hotDeals");
watch("reviews");
watch("announcements");
