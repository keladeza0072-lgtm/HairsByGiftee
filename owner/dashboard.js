const PROJECT="hairsbygiftee";
const BUCKET="hairsbygiftee.firebasestorage.app";
const FIRESTORE_BASE="https://firestore.googleapis.com/v1/projects/"+PROJECT+"/databases/(default)/documents";
const STORAGE_BASE="https://firebasestorage.googleapis.com/v0/b/"+BUCKET+"/o";

const state={products:[],reviews:[],announcements:[]};
let tab="home",editingId=null;

const token=()=>sessionStorage.getItem("hbg_id_token")||"";
const esc=(s="")=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const naira=v=>"₦"+Number(v||0).toLocaleString("en-NG");
const screen=()=>document.querySelector("#screen");

function fv(v){
  if(v===null||v===undefined)return {nullValue:null};
  if(typeof v==="boolean")return {booleanValue:v};
  if(typeof v==="number")return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(v instanceof Date)return {timestampValue:v.toISOString()};
  return {stringValue:String(v)};
}
function fieldsFrom(obj){
  const fields={};
  Object.entries(obj).forEach(([k,v])=>fields[k]=fv(v));
  return fields;
}
function valueFrom(v){
  if(!v)return null;
  if("stringValue" in v)return v.stringValue;
  if("integerValue" in v)return Number(v.integerValue);
  if("doubleValue" in v)return Number(v.doubleValue);
  if("booleanValue" in v)return v.booleanValue;
  if("timestampValue" in v)return v.timestampValue;
  if("nullValue" in v)return null;
  return null;
}
function docFromFirestore(d){
  const out={id:d.name.split("/").pop()};
  Object.entries(d.fields||{}).forEach(([k,v])=>out[k]=valueFrom(v));
  return out;
}
async function request(url,opts={},needsAuth=true){
  const headers=new Headers(opts.headers||{});
  if(needsAuth) headers.set("Authorization","Bearer "+token());
  const res=await fetch(url,{...opts,headers});
  let data={};
  if(res.status!==204){try{data=await res.json()}catch{}}
  if(!res.ok){
    const msg=data?.error?.message||("HTTP "+res.status);
    const err=new Error(msg); err.status=res.status; throw err;
  }
  return data;
}
async function listCollection(name){
  const data=await request(FIRESTORE_BASE+"/"+name+"?pageSize=100",{},false);
  return (data.documents||[]).map(docFromFirestore).sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
}
async function createDoc(name,data){
  return request(FIRESTORE_BASE+"/"+name,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({fields:fieldsFrom(data)})
  });
}
async function updateDoc(name,id,data){
  const masks=Object.keys(data).map(k=>"updateMask.fieldPaths="+encodeURIComponent(k)).join("&");
  return request(FIRESTORE_BASE+"/"+name+"/"+encodeURIComponent(id)+"?"+masks,{
    method:"PATCH",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({fields:fieldsFrom(data)})
  });
}
async function deleteDoc(name,id){
  return request(FIRESTORE_BASE+"/"+name+"/"+encodeURIComponent(id),{method:"DELETE"});
}
async function upload(file,folder){
  if(!file)return "";
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"-");
  const objectName=folder+"/"+Date.now()+"-"+safe;
  const res=await fetch(STORAGE_BASE+"?uploadType=media&name="+encodeURIComponent(objectName),{
    method:"POST",
    headers:{"Authorization":"Bearer "+token(),"Content-Type":file.type||"application/octet-stream"},
    body:file
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data?.error?.message||"Upload failed");
  return STORAGE_BASE+"/"+encodeURIComponent(objectName)+"?alt=media";
}
async function load(){
  const [products,reviews,announcements]=await Promise.all([
    listCollection("products"),listCollection("reviews"),listCollection("announcements")
  ]);
  state.products=products;state.reviews=reviews;state.announcements=announcements;
  render();
}
function setBusy(form,busy,label="Saving…"){
  const btn=form.querySelector('button[type="submit"]');
  if(!btn)return;
  if(busy){btn.dataset.old=btn.textContent;btn.textContent=label;btn.disabled=true}
  else{btn.textContent=btn.dataset.old||btn.textContent;btn.disabled=false}
}
function home(){
  const current=state.announcements.find(x=>x.active);
  return `<h1 class="admin-title">Welcome back</h1><p class="muted">Everything here updates the live website.</p>
  <div class="quick"><button data-go="products">＋<b>Add Product</b></button><button data-go="announcements">✦<b>Announcement</b></button><button data-go="deals">🔥<b>Hot Deal</b></button><button data-go="reviews">★<b>Add Review</b></button></div>
  <div class="panel"><b>At a glance</b><p>${state.products.length} products • ${state.products.filter(x=>x.hotDeal).length} hot deals • ${state.reviews.filter(x=>x.published!==false).length} reviews</p><p class="muted">Current announcement: ${esc(current?.message||"None")}</p></div>
  ${state.products.length===0?'<div class="panel"><b>Starting fresh?</b><p class="muted">Load the starter catalogue once, then replace it with the real stock.</p><button id="seedBtn" class="btn primary">Load starter catalogue</button></div>':""}`;
}
function products(){
  const edit=state.products.find(x=>x.id===editingId);
  return `<h1 class="admin-title">Products</h1><p class="muted">Add a wig, upload a photo, or edit what is live.</p>
  <form id="productForm" class="panel form-grid">
    <label class="field">Product name<input name="name" required value="${esc(edit?.name||"")}"></label>
    <label class="field">Price (₦)<input name="price" type="number" min="0" required value="${edit?.price||""}"></label>
    <label class="field">Category<select name="category"><option>Bone Straight</option><option>Curly</option><option>Bob Wigs</option><option>Coloured Wigs</option><option>Other</option></select></label>
    <label class="field">Hair details<input name="detail" value="${esc(edit?.detail||"")}" placeholder='22” • 200% • HD Lace'></label>
    <label class="field full">Product photo<input name="imageFile" type="file" accept="image/*">${edit?.image?'<small>Leave blank to keep the current photo.</small>':""}</label>
    <label class="check"><input name="available" type="checkbox" ${edit?.available===false?"":"checked"}> Available</label>
    <label class="check"><input name="bestseller" type="checkbox" ${edit?.bestseller?"checked":""}> Bestseller</label>
    <div class="field full admin-submit"><button class="btn primary" type="submit">${edit?"Save Changes":"Publish Product"}</button>${edit?'<button class="mini" id="cancelEdit" type="button">Cancel</button>':""}</div>
  </form>
  <div class="panel admin-list">${state.products.map(p=>`<div class="row product-row"><div class="row-product">${p.image?`<img src="${esc(p.image)}" alt="">`:""}<div><b>${esc(p.name)}</b><br><small>${esc(p.detail||"")} • ${naira(p.price)}</small></div></div><span>${p.available===false?"Sold out":"Available"}</span><div class="row-actions"><button class="mini" data-edit-product="${p.id}">Edit</button><button class="mini" data-toggle-product="${p.id}">${p.available===false?"Make available":"Mark sold out"}</button><button class="mini danger" data-delete-product="${p.id}">Delete</button></div></div>`).join("")||"<p>No products yet.</p>"}</div>`;
}
function deals(){
  return `<h1 class="admin-title">Hot Deals</h1><p class="muted">Choose an existing product and set its sale price.</p>
  <form id="dealForm" class="panel form-grid"><label class="field">Product<select name="product">${state.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label><label class="field">Sale price (₦)<input name="salePrice" type="number" min="0" required></label><div class="field full"><button class="btn primary" type="submit">Publish Deal</button></div></form>
  <div class="panel admin-list">${state.products.filter(p=>p.hotDeal).map(p=>`<div class="row"><div><b>${esc(p.name)}</b><br><small>${naira(p.price)} → ${naira(p.salePrice)}</small></div><span>Live deal</span><button class="mini danger" data-remove-deal="${p.id}">Remove</button></div>`).join("")||"<p>No hot deals yet.</p>"}</div>`;
}
function announcements(){
  return `<h1 class="admin-title">Announcements</h1><p class="muted">Show one short message at the top of the website.</p>
  <form id="announcementForm" class="panel"><label class="field">Message<textarea name="message" maxlength="160" required></textarea></label><br><button class="btn primary" type="submit">Publish Announcement</button></form>
  <div class="panel admin-list">${state.announcements.map(a=>`<div class="row"><div><b>${esc(a.message)}</b><br><small>${a.active?"Showing now":"Hidden"}</small></div><button class="mini" data-show-ann="${a.id}">${a.active?"Hide":"Show"}</button><button class="mini danger" data-delete-ann="${a.id}">Delete</button></div>`).join("")||"<p>No announcements yet.</p>"}</div>`;
}
function reviews(){
  return `<h1 class="admin-title">Reviews</h1><p class="muted">Publish customer feedback and photos.</p>
  <form id="reviewForm" class="panel form-grid"><label class="field">Customer name<input name="name" required></label><label class="field">Rating<select name="rating"><option>5</option><option>4</option><option>3</option></select></label><label class="field full">Customer photo<input name="imageFile" type="file" accept="image/*"></label><label class="field full">What did they say?<textarea name="quote" required></textarea></label><div class="field full"><button class="btn primary" type="submit">Publish Review</button></div></form>
  <div class="panel admin-list">${state.reviews.map(r=>`<div class="row"><div><b>${esc(r.name)} • ${"★".repeat(r.rating||5)}</b><br><small>“${esc(r.quote)}”</small></div><button class="mini" data-toggle-review="${r.id}">${r.published===false?"Show":"Hide"}</button><button class="mini danger" data-delete-review="${r.id}">Delete</button></div>`).join("")||"<p>No reviews yet.</p>"}</div>`;
}
function render(){
  screen().innerHTML=tab==="home"?home():tab==="products"?products():tab==="deals"?deals():tab==="announcements"?announcements():reviews();
  screen().querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>switchTab(b.dataset.go));
  wireActions();
}
function switchTab(next){
  tab=next;editingId=null;
  document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x.dataset.tab===tab));
  render();
}
function wireActions(){
  const seed=document.querySelector("#seedBtn");
  if(seed)seed.onclick=async()=>{seed.disabled=true;try{
    const starter=[
      {name:"Luxe Bone Straight",price:165000,salePrice:130000,detail:'22” • 200% • HD Lace',category:"Bone Straight",hotDeal:true,bestseller:true,available:true,image:"https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=85"},
      {name:"Dreamy Curls",price:182000,salePrice:149000,detail:'20” • 180% • HD Lace',category:"Curly",hotDeal:true,bestseller:true,available:true,image:"https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=900&q=85"},
      {name:"Classic Bob",price:145000,salePrice:119000,detail:'14” • 180% • HD Lace',category:"Bob Wigs",hotDeal:true,bestseller:true,available:true,image:"https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=85"},
      {name:"Piano Highlight",price:205000,detail:'22” • 200% • HD Lace',category:"Coloured Wigs",hotDeal:false,bestseller:true,available:true,image:"https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=900&q=85"}
    ];
    for(const p of starter)await createDoc("products",{...p,createdAt:new Date()});
    await load();
  }catch(e){alert(e.message);seed.disabled=false}};
  const cancel=document.querySelector("#cancelEdit");if(cancel)cancel.onclick=()=>{editingId=null;render()};

  const pf=document.querySelector("#productForm");
  if(pf)pf.onsubmit=async e=>{e.preventDefault();setBusy(pf,true);try{
    const f=new FormData(pf),old=state.products.find(x=>x.id===editingId),file=pf.elements.imageFile.files[0];
    const image=file?await upload(file,"products"):(old?.image||"");
    const data={name:f.get("name").trim(),price:Number(f.get("price")),category:f.get("category"),detail:f.get("detail").trim(),image,available:f.get("available")==="on",bestseller:f.get("bestseller")==="on",updatedAt:new Date()};
    if(editingId)await updateDoc("products",editingId,data);else await createDoc("products",{...data,hotDeal:false,salePrice:null,createdAt:new Date()});
    editingId=null;await load();
  }catch(e){alert("Could not save product: "+e.message)}finally{setBusy(pf,false)}};

  document.querySelectorAll("[data-edit-product]").forEach(b=>b.onclick=()=>{editingId=b.dataset.editProduct;render();window.scrollTo({top:0,behavior:"smooth"})});
  document.querySelectorAll("[data-toggle-product]").forEach(b=>b.onclick=async()=>{const p=state.products.find(x=>x.id===b.dataset.toggleProduct);await updateDoc("products",p.id,{available:p.available===false,updatedAt:new Date()});await load()});
  document.querySelectorAll("[data-delete-product]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this product from the website?")){await deleteDoc("products",b.dataset.deleteProduct);await load()}});

  const df=document.querySelector("#dealForm");
  if(df)df.onsubmit=async e=>{e.preventDefault();const f=new FormData(df);await updateDoc("products",f.get("product"),{hotDeal:true,salePrice:Number(f.get("salePrice")),updatedAt:new Date()});await load()};
  document.querySelectorAll("[data-remove-deal]").forEach(b=>b.onclick=async()=>{await updateDoc("products",b.dataset.removeDeal,{hotDeal:false,salePrice:null,updatedAt:new Date()});await load()});

  const af=document.querySelector("#announcementForm");
  if(af)af.onsubmit=async e=>{e.preventDefault();const f=new FormData(af);for(const a of state.announcements)await updateDoc("announcements",a.id,{active:false});await createDoc("announcements",{message:f.get("message").trim(),active:true,createdAt:new Date()});await load()};
  document.querySelectorAll("[data-show-ann]").forEach(b=>b.onclick=async()=>{const target=state.announcements.find(x=>x.id===b.dataset.showAnn);for(const a of state.announcements)await updateDoc("announcements",a.id,{active:a.id===target.id?!target.active:false});await load()});
  document.querySelectorAll("[data-delete-ann]").forEach(b=>b.onclick=async()=>{await deleteDoc("announcements",b.dataset.deleteAnn);await load()});

  const rf=document.querySelector("#reviewForm");
  if(rf)rf.onsubmit=async e=>{e.preventDefault();setBusy(rf,true);try{
    const f=new FormData(rf),file=rf.elements.imageFile.files[0],image=file?await upload(file,"reviews"):"";
    await createDoc("reviews",{name:f.get("name").trim(),rating:Number(f.get("rating")),quote:f.get("quote").trim(),image,published:true,createdAt:new Date()});
    await load();
  }catch(e){alert("Could not save review: "+e.message)}finally{setBusy(rf,false)}};
  document.querySelectorAll("[data-toggle-review]").forEach(b=>b.onclick=async()=>{const r=state.reviews.find(x=>x.id===b.dataset.toggleReview);await updateDoc("reviews",r.id,{published:r.published===false});await load()});
  document.querySelectorAll("[data-delete-review]").forEach(b=>b.onclick=async()=>{await deleteDoc("reviews",b.dataset.deleteReview);await load()});
}

document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
document.querySelector("#logoutBtn").onclick=()=>{
  sessionStorage.clear();
  window.location.href="./";
};

screen().innerHTML='<div class="panel"><b>Loading your live website data…</b><p class="muted">This should only take a moment.</p></div>';
load().catch(err=>{
  screen().innerHTML='<div class="panel dashboard-error"><b>Dashboard could not load.</b><p class="muted">'+esc(err.message)+'</p><div class="admin-submit"><button id="retryBtn" class="btn primary">Try again</button><button id="backLoginBtn" class="mini">Sign in again</button></div></div>';
  const retry=document.querySelector("#retryBtn");if(retry)retry.onclick=()=>location.reload();
  const back=document.querySelector("#backLoginBtn");if(back)back.onclick=()=>{sessionStorage.clear();window.location.replace("./")};
});
