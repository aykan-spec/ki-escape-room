const scene = document.getElementById("scene");
const input = document.getElementById("answer");
const button = document.getElementById("submit");
const feedback = document.getElementById("feedback");

let stage = 0;

const levels = [
  {
    text: "Du wachst in einem digitalen Labor auf. Ein Computer fragt dich: 'Wie nennt man Maschinen, die denken können?'",
    answer: "künstliche intelligenz",
  },
  {
    text: "Ein Roboter blockiert den Ausgang. Er sagt: 'Ich erkenne dich nur, wenn du sagst, was KI in deinem Handy tut (z.B. Siri oder Alexa).'",
    answer: "sprachassistent",
  },
  {
    text: "Eine Tür öffnet sich. Auf einem Bildschirm steht: 'KI kann aus Daten lernen. Wie nennt man das?'",
    answer: "lernen",
  },
  {
    text: "Letztes Rätsel: 'Was bist du gerade dabei zu spielen?'",
    answer: "escape room",
  },
];

function showLevel() {
  scene.textContent = levels[stage].text;
  feedback.textContent = "";
  input.value = "";
}

button.addEventListener("click", () => {
  const userAnswer = input.value.trim().toLowerCase();
  if (userAnswer === levels[stage].answer) {
    feedback.textContent = "✅ Richtig!";
    stage++;
    if (stage < levels.length) {
      setTimeout(showLevel, 1000);
    } else {
      scene.textContent = "🎉 Du hast den KI Escape Room geschafft!";
      input.style.display = "none";
      button.style.display = "none";
    }
  } else {
    feedback.textContent = "❌ Falsch! Versuch es nochmal.";
  }
});

showLevel();
