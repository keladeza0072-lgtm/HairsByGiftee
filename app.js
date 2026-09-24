import { db } from "./firebase-client.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const WA="2347087861972";

const fallbackProducts=[
  {id:"p1",name:"Bone Straight Wig",price:180000,detail:'22” • 200% • HD Lace',category:"Bone Straight",bestseller:true,available:true,image:"https://images.pexels.com/photos/29824659/pexels-photo-29824659/free-photo-of-smiling-woman-holding-hair-extensions.jpeg?auto=compress&cs=tinysrgb&w=900"},
  {id:"p2",name:"Body Wave Wig",price:170000,detail:'20” • 180% • HD Lace',category:"Body Wave",available:true,image:"https://images.pexels.com/photos/32782509/pexels-photo-32782509/free-photo-of-stylish-studio-portrait-of-three-black-women.jpeg?auto=compress&cs=tinysrgb&w=900"},
  {id:"p3",name:"Bob Wig",price:150000,detail:'14” • 180% • HD Lace',category:"Bob",hotDeal:true,salePrice:135000,available:true,image:"https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=900&q=85"},
  {id:"p4",name:"Curly Wig",price:160000,detail:'20” • 180% • HD Lace',category:"Curly",available:true,image:"https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=900&q=85"}
];

const fallbackReviews=[
  {id:"r1",name:"Tolu",rating:5,quote:"The hair is so soft and the quality is amazing! I love it 💕",published:true,image:"https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=300&q=80"},
  {id:"r2",name:"Amara",rating:5,quote:"Beautiful hair and very easy to wear.",published:true,image:""},
  {id:"r3",name:"Chinaza",rating:5,quote:"The quality is top tier. I will definitely order again.",published:true,image:""}
];

const state={products:fallbackProducts,reviews:fallbackReviews};
let activeCategory="All";
let searchTerm="";
let reviewIndex=0;
let reviewTimer=null;

const money=v=>"₦"+Number(v||0).toLocaleString("en-NG");
const esc=(v="")=>String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const productImages=p=>{
  const imgs=Array.isArray(p.images)?p.images.filter(Boolean):[];
  if(p.image&&!imgs.includes(p.image))imgs.unshift(p.image);
  return imgs.length?imgs:[fallbackProducts[0].image];
};
const whatsapp=(p,price)=>"https://wa.me/"+WA+"?text="+encodeURIComponent(
  "Hi HairsByGiftee ❤️\nI'm interested in the "+p.name+".\n"+(p.detail||"")+"\nPrice: ₦"+Number(price).toLocaleString("en-NG")+"\n\nIs it currently available?"
);

function visibleProducts(){
  return state.products.filter(p=>p.available!==false).filter(p=>{
    const categoryOk=activeCategory==="All"||String(p.category||"")===activeCategory;
    const hay=(String(p.name||"")+" "+String(p.category||"")+" "+String(p.detail||"")).toLowerCase();
    return categoryOk&&(!searchTerm||hay.includes(searchTerm));
  });
}

function productCard(p){
  const sale=p.hotDeal&&p.salePrice;
  const final=sale?p.salePrice:p.price;
  const badges=[
    p.bestseller?'<span class="badge badge-best">Bestseller</span>':"",
    sale?'<span class="badge badge-sale">Hot Deal</span>':""
  ].join("");
  return `<article class="product" data-product-id="${esc(p.id)}" tabindex="0" role="button">
    <div class="product-image">
      <img src="${esc(productImages(p)[0])}" alt="${esc(p.name)}" loading="lazy">
      ${badges}
    </div>
    <div class="product-copy">
      <h3>${esc(p.name)}</h3>
      <div class="product-meta">${esc(p.detail||"")}</div>
      <div class="price"><strong>${money(final)}</strong>${sale?`<del>${money(p.price)}</del>`:""}</div>
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
  const products=visibleProducts();
  document.querySelector("#shopGrid").innerHTML=products.length?products.map(productCard).join(""):'<div class="empty">No wigs found.</div>';
  renderFilters();
  wireProducts();
}

function dealCard(p){
  const final=p.salePrice||p.price;
  return `<article class="deal-card" data-product-id="${esc(p.id)}" tabindex="0" role="button">
    <div class="deal-image">
      <img src="${esc(productImages(p)[0])}" alt="${esc(p.name)}" loading="lazy">
      <span class="deal-badge">Hot Deal</span>
    </div>
    <div class="deal-copy">
      <h3>${esc(p.name)}</h3>
      <div class="deal-price"><strong>${money(final)}</strong>${p.salePrice?`<del>${money(p.price)}</del>`:""}</div>
      <span class="deal-view">View Deal</span>
    </div>
  </article>`;
}

function renderDeals(){
  const section=document.querySelector(".deals-section");
  const rail=document.querySelector("#dealRail");
  if(!section||!rail)return;
  const deals=state.products.filter(p=>p.available!==false&&p.hotDeal&&p.salePrice);
  section.hidden=!deals.length;
  if(!deals.length)return;
  rail.innerHTML=deals.map(dealCard).join("");
  wireProducts();
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
  const imgs=productImages(p);
  const sale=p.hotDeal&&p.salePrice;
  const final=sale?p.salePrice:p.price;

  document.querySelector("#modalImage").src=imgs[0];
  document.querySelector("#modalImage").alt=p.name;
  document.querySelector("#modalTitle").textContent=p.name;
  document.querySelector("#modalCategory").textContent=p.category||"";
  document.querySelector("#modalDetail").textContent=p.detail||"";
  document.querySelector("#modalPrice").innerHTML=`<strong>${money(final)}</strong>${sale?`<del>${money(p.price)}</del>`:""}`;
  document.querySelector("#modalStock").textContent=p.available===false?"Sold out":"Available";
  document.querySelector("#modalBuy").href=whatsapp(p,final);

  document.querySelector("#modalThumbs").innerHTML=imgs.length>1?imgs.map((src,i)=>`<button type="button" class="${i===0?"active":""}" data-thumb="${i}"><img src="${esc(src)}" alt=""></button>`).join(""):"";
  document.querySelectorAll("[data-thumb]").forEach(btn=>btn.onclick=()=>{
    document.querySelector("#modalImage").src=imgs[Number(btn.dataset.thumb)];
    document.querySelectorAll("[data-thumb]").forEach(x=>x.classList.toggle("active",x===btn));
  });

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

function render(){
  renderShop();
  renderDeals();
  renderReview();
  restartReviews();
}

function watch(name){
  onSnapshot(collection(db,name),snap=>{
    if(!snap.empty){
      state[name]=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    }
    render();
  },()=>render());
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
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});

render();
watch("products");
watch("reviews");
