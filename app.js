import { db } from "./firebase-client.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const WA="2347087861972";

const state={products:[],hotDeals:[],classes:[],reviews:[],announcements:[],settings:[]};
const loading={products:true,hotDeals:true,classes:true,reviews:true,announcements:true,settings:true};
const loadError={products:false,hotDeals:false,classes:false,reviews:false,announcements:false,settings:false};
const PAYMENTS_CONNECTED=false;
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
    ? `<img src="${esc(src)}" alt="${esc(p.name||"Wig")}" loading="lazy" decoding="async">`
    : '<div class="product-image-placeholder" aria-hidden="true"></div>';
};
const whatsapp=(p,price)=>"https://wa.me/"+WA+"?text="+encodeURIComponent(
  "Hi HairsByGiftee ❤️\nI'm interested in the "+p.name+".\n"+(p.detail||"")+"\nPrice: ₦"+Number(price).toLocaleString("en-NG")+"\n\nIs it currently available?"
);
const stockCount=item=>{
  if(item?.stock===null||item?.stock===undefined||item?.stock==="")return 1;
  const n=Math.floor(Number(item.stock));
  return Number.isFinite(n)?Math.max(0,n):1;
};
const isInStock=item=>item?.available!==false&&stockCount(item)>0;
const checkoutSettings=()=>state.settings.find(x=>x.id==="checkout")||{};
let checkoutItem=null;
let checkoutKind="product";

const NIGERIA_STATES=[
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu",
  "FCT Abuja","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo",
  "Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"
];
const SHIPPING_ZONE_STATES={
  "Lagos":["Lagos"],
  "South West":["Ekiti","Ogun","Ondo","Osun","Oyo"],
  "South East":["Abia","Anambra","Ebonyi","Enugu","Imo"],
  "South South":["Akwa Ibom","Bayelsa","Cross River","Delta","Edo","Rivers"],
  "North Central":["Benue","FCT Abuja","Kogi","Kwara","Nasarawa","Niger","Plateau"],
  "North East":["Adamawa","Bauchi","Borno","Gombe","Taraba","Yobe"],
  "North West":["Jigawa","Kaduna","Kano","Katsina","Kebbi","Sokoto","Zamfara"]
};
const SHIPPING_ZONE_FIELDS={
  "Lagos":"shippingLagos","South West":"shippingSouthWest","South East":"shippingSouthEast",
  "South South":"shippingSouthSouth","North Central":"shippingNorthCentral",
  "North East":"shippingNorthEast","North West":"shippingNorthWest"
};
function shippingZoneForState(stateName){
  const clean=String(stateName||"").trim();
  return Object.keys(SHIPPING_ZONE_STATES).find(zone=>SHIPPING_ZONE_STATES[zone].includes(clean))||"";
}
function deliveryFor(country,stateName,subtotal=0){
  const cfg=checkoutSettings();
  if(country==="Nigeria"){
    const threshold=Number(cfg.freeShippingThreshold||0);
    if(cfg.freeShippingEnabled===true&&threshold>0&&Number(subtotal)>=threshold){
      return {fee:0,label:"Free",zone:shippingZoneForState(stateName)};
    }
    const zone=shippingZoneForState(stateName);
    const field=SHIPPING_ZONE_FIELDS[zone];
    let raw=field?cfg[field]:0;
    if((raw===undefined||raw===null||raw==="")&&zone==="Lagos")raw=cfg.lagosFee;
    if((raw===undefined||raw===null||raw==="")&&zone&&zone!=="Lagos")raw=cfg.nigeriaFee;
    const fee=Number(raw);
    return Number.isFinite(fee)&&fee>0
      ?{fee,label:money(fee),zone}
      :{fee:0,label:zone?"Delivery fee pending":"Select a Nigerian state",zone};
  }
  return {fee:0,label:cfg.internationalNote||"Confirmed separately",zone:"International"};
}
function checkoutStateName(){
  const country=document.querySelector("#checkoutCountry").value;
  return country==="Nigeria"
    ?document.querySelector("#checkoutState").value
    :document.querySelector("#checkoutRegion").value.trim();
}
function syncCheckoutLocationFields(){
  const country=document.querySelector("#checkoutCountry").value;
  const isNigeria=country==="Nigeria";
  const stateField=document.querySelector("#checkoutStateField");
  const regionField=document.querySelector("#checkoutRegionField");
  const state=document.querySelector("#checkoutState");
  const region=document.querySelector("#checkoutRegion");
  stateField.hidden=!isNigeria;
  regionField.hidden=isNigeria;
  state.required=isNigeria;
  region.required=!isNigeria;
}

function populateNigeriaStates(){
  const stateSelect=document.querySelector("#checkoutState");
  if(!stateSelect)return;
  stateSelect.innerHTML='<option value="">Select state</option>'+NIGERIA_STATES.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("");
}
populateNigeriaStates();

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
  return state.products.filter(isInStock).filter(p=>{
    const categoryOk=activeCategory==="All"||String(p.category||"")===activeCategory;
    const hay=(String(p.name||"")+" "+String(p.category||"")+" "+String(p.detail||"")).toLowerCase();
    return categoryOk&&(!searchTerm||hay.includes(searchTerm));
  });
}

function productCard(p){
  const badges=[
    p.bestseller?'<span class="badge badge-best">Bestseller</span>':""
  ].join("");
  return `<article class="product" data-product-id="${esc(p.id)}">
    <div class="product-image">
      ${productImageMarkup(p)}
      ${badges}
    </div>
    <div class="product-copy">
      <h3>${esc(p.name)}</h3>
      <div class="product-meta">${esc(p.detail||"")}</div>
      <div class="price"><strong>${money(p.price)}</strong></div>
      <button class="view-details buy-card" type="button" data-buy-product="${esc(p.id)}">Buy Now</button>
    </div>
  </article>`;
}

function renderFilters(){
  const categories=["All",...new Set(state.products.filter(isInStock).map(p=>p.category).filter(Boolean))];
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
      <button class="deal-view buy-card" type="button" data-buy-deal="${esc(d.id)}">Buy Now</button>
    </div>
  </article>`;
}

function renderDeals(){
  const section=document.querySelector(".deals-section");
  const rail=document.querySelector("#dealRail");
  if(!section||!rail)return;
  if(loading.hotDeals||loadError.hotDeals){section.hidden=true;rail.innerHTML="";return;}
  const deals=state.hotDeals.filter(isInStock);
  section.hidden=!deals.length;
  if(!deals.length){rail.innerHTML="";return;}
  rail.innerHTML=deals.map(dealCard).join("");
  wireDeals();
}

function wireDeals(){
  document.querySelectorAll("[data-deal-id]").forEach(card=>{
    card.onclick=e=>{if(!e.target.closest("[data-buy-deal]"))openDeal(card.dataset.dealId)};
  });
  document.querySelectorAll("[data-buy-deal]").forEach(btn=>btn.onclick=e=>{
    e.stopPropagation(); openCheckout("deal",btn.dataset.buyDeal);
  });
}

function classCard(c){
  const format=[c.format,c.duration].filter(Boolean).join(" • ");
  const schedule=[c.schedule,c.location].filter(Boolean).join(" · ");
  const seats=stockCount(c);
  return '<article class="class-card" data-class-id="'+esc(c.id)+'">'+
    '<div class="class-image">'+productImageMarkup(c)+'<span class="class-badge">'+esc(c.format||"Class")+'</span></div>'+
    '<div class="class-copy">'+
      '<p class="class-meta">'+esc(format)+'</p>'+
      '<h3>'+esc(c.name||"Hairstyling Class")+'</h3>'+
      '<p class="class-description">'+esc(c.detail||"")+'</p>'+
      '<p class="class-schedule">'+esc(schedule)+'</p>'+
      '<div class="class-bottom"><strong>'+money(c.price)+'</strong><span>'+seats+' seat'+(seats===1?"":"s")+' left</span></div>'+
      '<button class="class-book" type="button" data-book-class="'+esc(c.id)+'">Book Class</button>'+
    '</div></article>';
}
function renderClasses(){
  const section=document.querySelector("#classes");
  const grid=document.querySelector("#classGrid");
  if(!section||!grid)return;
  section.hidden=false;
  if(loading.classes){grid.innerHTML='<div class="classes-empty">Loading class dates…</div>';return;}
  if(loadError.classes){grid.innerHTML='<div class="classes-empty">Class details will be available here soon.</div>';return;}
  const classes=state.classes.filter(isInStock);
  if(!classes.length){grid.innerHTML='<div class="classes-empty">New class dates will be announced here soon.</div>';return;}
  grid.innerHTML=classes.map(classCard).join("");
  document.querySelectorAll("[data-book-class]").forEach(btn=>btn.onclick=()=>openCheckout("class",btn.dataset.bookClass));
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
  document.querySelector("#modalThumbs").innerHTML=imgs.length>1?imgs.map((src,i)=>`<button type="button" class="${i===0?"active":""}" data-thumb="${i}"><img src="${esc(src)}" alt="" decoding="async"></button>`).join(""):"";
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
  document.querySelector("#modalStock").textContent=isInStock(d)?(stockCount(d)+" available"):"Offer unavailable";
  const buy=document.querySelector("#modalBuy");
  buy.textContent="Buy Now"; buy.dataset.kind="deal"; buy.dataset.id=d.id; buy.disabled=!isInStock(d);
  document.querySelector("#productModal").hidden=false;
  document.body.classList.add("modal-open");
}

function wireProducts(){
  document.querySelectorAll("[data-product-id]").forEach(card=>{
    card.onclick=e=>{if(!e.target.closest("[data-buy-product]"))openProduct(card.dataset.productId)};
  });
  document.querySelectorAll("[data-buy-product]").forEach(btn=>btn.onclick=e=>{
    e.stopPropagation(); openCheckout("product",btn.dataset.buyProduct);
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
  document.querySelector("#modalStock").textContent=isInStock(p)?(stockCount(p)+" available"):"Sold out";
  const buy=document.querySelector("#modalBuy");
  buy.textContent="Buy Now"; buy.dataset.kind="product"; buy.dataset.id=p.id; buy.disabled=!isInStock(p);
  document.querySelector("#productModal").hidden=false;
  document.body.classList.add("modal-open");
}

function closeModal(){
  document.querySelector("#productModal").hidden=true;
  document.body.classList.remove("modal-open");
}

function updateCheckoutSummary(){
  if(!checkoutItem)return;
  const form=document.querySelector("#checkoutForm");
  const qty=Math.max(1,Math.min(stockCount(checkoutItem),Number(form.quantity.value)||1));
  form.quantity.value=qty;
  const subtotal=Number(checkoutItem.price||0)*qty;
  const delivery=checkoutKind==="class"
    ?{fee:0,label:"Not required",zone:"Class booking"}
    :deliveryFor(form.country.value,checkoutStateName(),subtotal);
  document.querySelector("#checkoutSubtotal").textContent=money(subtotal);
  document.querySelector("#checkoutDelivery").textContent=delivery.label;
  document.querySelector("#checkoutTotal").textContent=money(subtotal+delivery.fee);
}

function openCheckout(kind,id){
  const source=kind==="deal"?state.hotDeals:kind==="class"?state.classes:state.products;
  const item=source.find(x=>String(x.id)===String(id));
  if(!item||!isInStock(item))return;
  checkoutItem=item;
  checkoutKind=kind;
  closeModal();
  const isClass=kind==="class";
  const img=productImages(item)[0]||"";
  const checkoutImage=document.querySelector("#checkoutImage");
  if(img){checkoutImage.src=img;checkoutImage.alt=item.name||"";checkoutImage.hidden=false}
  else{checkoutImage.removeAttribute("src");checkoutImage.alt="";checkoutImage.hidden=true}
  document.querySelector("#checkoutTitle").textContent=item.name||"Order";
  document.querySelector("#checkoutDetail").textContent=item.detail||"";
  document.querySelector("#checkoutItemPrice").textContent=money(item.price);
  const qty=document.querySelector("#checkoutQuantity");
  qty.value=1; qty.max=String(stockCount(item));
  document.querySelector("#checkoutQuantityLabel").textContent=isClass?"Seats":"Quantity";
  document.querySelector("#checkoutCountryField").hidden=isClass;
  document.querySelector("#checkoutStateField").hidden=isClass;
  document.querySelector("#checkoutRegionField").hidden=isClass;
  document.querySelector("#checkoutAddressField").hidden=isClass;
  document.querySelector("#checkoutCountry").required=!isClass;
  document.querySelector("#checkoutState").required=!isClass&&document.querySelector("#checkoutCountry").value==="Nigeria";
  document.querySelector("#checkoutRegion").required=!isClass&&document.querySelector("#checkoutCountry").value!=="Nigeria";
  document.querySelector("#checkoutAddress").required=!isClass;
  if(!isClass)syncCheckoutLocationFields();
  document.querySelector("#checkoutDelivery").parentElement.hidden=isClass;
  document.querySelector(".checkout-kicker").textContent=isClass?"CLASS BOOKING":"YOUR ORDER";
  document.querySelector("#checkoutNotice").textContent=PAYMENTS_CONNECTED
    ?(isClass?"Your class fee will be verified securely before Paystack opens.":"Your order total and delivery fee will be verified securely before Paystack opens.")
    :(isClass?"Secure Paystack payment is being connected. Until it is switched on, Book Class will continue the completed booking through WhatsApp.":"Secure Paystack payment is being connected. Until it is switched on, Buy Now will continue the completed order through WhatsApp.");
  document.querySelector("#checkoutSubmit").textContent=PAYMENTS_CONNECTED?"Continue to secure payment":(isClass?"Continue booking":"Continue order");
  document.querySelector("#checkoutModal").hidden=false;
  document.body.classList.add("modal-open");
  updateCheckoutSummary();
}

function closeCheckout(){
  document.querySelector("#checkoutModal").hidden=true;
  document.body.classList.remove("modal-open");
  checkoutItem=null;
  checkoutKind="product";
}

function reviewCard(r){
  const image=r.image?`<img src="${esc(r.image)}" alt="${esc(r.name)}" loading="lazy" decoding="async">`:'';
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
  renderClasses();
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
document.querySelector("#modalBuy").onclick=()=>{
  const btn=document.querySelector("#modalBuy");
  if(btn.dataset.id)openCheckout(btn.dataset.kind||"product",btn.dataset.id);
};
document.querySelector("#checkoutClose").onclick=closeCheckout;
document.querySelector("#checkoutBackdrop").onclick=closeCheckout;
document.querySelector("#checkoutQuantity").addEventListener("input",updateCheckoutSummary);
document.querySelector("#checkoutCountry").addEventListener("change",()=>{syncCheckoutLocationFields();updateCheckoutSummary()});
document.querySelector("#checkoutState").addEventListener("change",updateCheckoutSummary);
document.querySelector("#checkoutRegion").addEventListener("input",updateCheckoutSummary);
document.querySelector("#checkoutForm").onsubmit=e=>{
  e.preventDefault();
  if(!checkoutItem)return;
  const form=e.currentTarget;
  if(!form.reportValidity())return;
  const data=new FormData(form);
  const qty=Math.max(1,Math.min(stockCount(checkoutItem),Number(data.get("quantity"))||1));
  const subtotal=Number(checkoutItem.price||0)*qty;
  const stateName=checkoutKind==="class"?"":checkoutStateName();
  const delivery=checkoutKind==="class"?{fee:0,label:"Not required"}:deliveryFor(String(data.get("country")||""),stateName,subtotal);
  if(PAYMENTS_CONNECTED){ alert("Secure payment connection is not enabled yet."); return; }
  const lines=checkoutKind==="class"
    ?[
      "Hi HairsByGiftee ❤️","I'd like to book this class:","",
      checkoutItem.name+" × "+qty+" seat"+(qty===1?"":"s"),
      "Class fee: ₦"+subtotal.toLocaleString("en-NG"),
      checkoutItem.schedule?"Schedule: "+checkoutItem.schedule:"",
      checkoutItem.format?"Format: "+checkoutItem.format:"",
      checkoutItem.location?"Location: "+checkoutItem.location:"","",
      "Name: "+data.get("name"),"Email: "+data.get("email"),"Phone: "+data.get("phone")
    ].filter(Boolean)
    :[
      "Hi HairsByGiftee ❤️","I'd like to place this order:","",
      checkoutItem.name+" × "+qty,
      "Item total: ₦"+subtotal.toLocaleString("en-NG"),
      delivery.fee?"Delivery: ₦"+delivery.fee.toLocaleString("en-NG"):"Delivery: "+delivery.label,"",
      "Name: "+data.get("name"),"Email: "+data.get("email"),"Phone: "+data.get("phone"),
      "Country: "+data.get("country"),"State/Region: "+stateName,"Address: "+data.get("address")
    ];
  if(String(data.get("note")||"").trim())lines.push("Note: "+String(data.get("note")).trim());
  window.open("https://wa.me/"+WA+"?text="+encodeURIComponent(lines.join("\n")),"_blank","noopener,noreferrer");
  closeCheckout();
};
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeModal();closeCheckout();closeMenu()}});

render();
loadFxRates();
watch("products");
watch("hotDeals");
watch("classes");
watch("reviews");
watch("announcements");
watch("settings");
