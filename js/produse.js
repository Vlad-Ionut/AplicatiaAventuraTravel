window.onload=function(){

    const inpPret = document.getElementById("inp-pret");
    const infoRange = document.getElementById("infoRange");
    const btnFiltrare = document.getElementById("filtrare");
    const btnResetare = document.getElementById("resetare");

    function produseCatalog() {
        return Array.from(document.getElementsByClassName("produs"));
    }

    function textDinCard(prod, selector, fallback = "") {
        const el = prod.querySelector(selector);
        return (el ? el.textContent : fallback).trim();
    }

    if (inpPret) {
        inpPret.oninput=function(){
            let val=this.value.trim();
            if (infoRange) infoRange.innerHTML=`(${val})`;
        }
    }

    if (btnFiltrare) btnFiltrare.onclick=function(){
        let inpNume=document.getElementById("inp-nume").value.trim().toLowerCase()
        let inpPretMin=parseFloat(document.getElementById("inp-pret").value.trim()) || 0;
        let inpCategorie=document.getElementById("inp-categorie").value.trim().toLowerCase();

        for (let prod of produseCatalog()){
            let nume=textDinCard(prod, ".valoare-nume", prod.dataset.nume || "").toLowerCase()
            let cond1=nume.includes(inpNume)

            let pret=parseFloat(textDinCard(prod, ".valoare-pret", prod.dataset.pret || "0"))
            let cond2=pret>=inpPretMin

            let categorie=textDinCard(prod, ".valoare-categorie", prod.dataset.categorie || "").toLowerCase()
            let cond3=categorie==inpCategorie||inpCategorie=="toate";

            prod.hidden = !(cond1&&cond2&&cond3);
        }
    }
    if (btnResetare) btnResetare.onclick=function(){
        document.getElementById("inp-nume").value=""
        document.getElementById("inp-pret").value="0"
        if (infoRange) infoRange.innerHTML="(0)"
        document.getElementById("inp-categorie").value="toate"

        for (let prod of produseCatalog()){
            prod.hidden = false;
        }

    }


    function sorteaza(semn){
        let vProduse= produseCatalog()
        vProduse.sort(function(a,b){
            let numeA=textDinCard(a, ".valoare-nume", a.dataset.nume || "").toLowerCase()
            let numeB=textDinCard(b, ".valoare-nume", b.dataset.nume || "").toLowerCase()
            return semn*numeA.localeCompare(numeB, "ro", { sensitivity: "base" })
        })
        for (let prod of vProduse){
            prod.parentElement.appendChild(prod)
        }
    }

    document.getElementById("sortCrescNume").onclick=function(){sorteaza(1)}
    document.getElementById("sortDescrescNume").onclick=function(){sorteaza(-1)}

    window.onkeydown=function(e){
        if (e.key=="c" && e.altKey){
            let suma=0;
            for (let prod of produseCatalog()){
                if (!prod.hidden){
                    suma+=parseFloat(textDinCard(prod, ".valoare-pret", prod.dataset.pret || "0"))
                }
            }
            let p =this.document.getElementById("infoSuma")
            if(!p){
                p= this.document.createElement("p")
                p.innerHTML=suma
                p.id="infoSuma"
                let sectiuneProduse=this.document.getElementById("produse")
                sectiuneProduse.parentElement.insertBefore(p, sectiuneProduse)
                this.setTimeout(function(){
                    let p1 =this.document.getElementById("infoSuma")
                    p1.remove()
                }, 2000)
            }
            else{
                p.innerHTML=suma
            }
            
        }

    }
   
}