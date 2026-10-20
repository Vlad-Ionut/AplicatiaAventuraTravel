
    let tema=localStorage.getItem("tema");
    if(tema)
        document.body.classList.add("intunecat");
        
window.addEventListener("DOMContentLoaded", function(){
    document.getElementById("tema").onclick= function(){
        if(document.body.classList.contains("intunecat")){
            document.body.classList.remove("intunecat")
            localStorage.removeItem("tema");
        }
        else{
            document.body.classList.add("intunecat")
            localStorage.setItem("tema","intunecat");
        }
    }
});