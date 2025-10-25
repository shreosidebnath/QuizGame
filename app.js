// question class holds each question's data and checks answers
class Question {
    constructor(text, choices, answer, difficulty, category) {
        this.text = text; 
        this.choices = choices; 
        this.answer = answer;
        this.difficulty = difficulty;
        this.category = category;
    }
    
    isCorrectAnswer(choice) {
        return this.answer === choice;
    }

    // method used to demo 'call' later
    displayInfo(prefix) {
        return `${prefix}: ${this.text} [${this.difficulty}]`;
    }
}

// quiz class manages the overall quiz state and scoring
class Quiz {
    constructor(questions) {
        this.score = 0;
        this.questions = questions;
        this.questionIndex = 0;
        this.correctAnswers = 0;
        this.incorrectAnswers = 0;
    }

    getCurrentQuestion() {
        return this.questions[this.questionIndex];
    }

    checkAnswer(isCorrect) {
        if (isCorrect) {
            this.correctAnswers++;
            this.score++;
        } else {
            this.incorrectAnswers++;
        }
        return isCorrect;
    }

    nextQuestion() {
        this.questionIndex++;
    }

    isEnded() {
        return this.questionIndex === this.questions.length;
    }

    // method used to demo apply later
    calculateStats(...args) {
        const total = args.reduce((sum, val) => sum + val, 0);
        return {
            total,
            average: total / args.length
        };
    }
}

// user class stores username and score history using localStorage
class User {
    constructor(username) {
        this.username = username;
        this.scoreHistory = this.loadScoreHistory();
    }

    addScore(score, totalQuestions, category) {
        const attempt = {
            username: this.username,
            score: score,
            total: totalQuestions,
            percentage: Math.round((score / totalQuestions) * 100),
            category: category,
            date: new Date().toLocaleString(),
            timestamp: Date.now()
        };
        this.scoreHistory.push(attempt);
        this.saveScoreHistory();
    }

    getScoreHistory() {
        return this.scoreHistory;
    }

    loadScoreHistory() {
        const stored = localStorage.getItem(`quiz_history_${this.username}`);
        return stored ? JSON.parse(stored) : [];
    }

    saveScoreHistory() {
        localStorage.setItem(`quiz_history_${this.username}`, JSON.stringify(this.scoreHistory));
    }

    displayUserInfo() {
        return `Username: ${this.username}, Total Attempts: ${this.scoreHistory.length}`;
    }
}

// async function to fetch questions from open trivia db api
async function fetchQuestions(category = '') {
    const categoryParam = category ? `&category=${category}` : '';
    const url = `https://opentdb.com/api.php?amount=12&type=multiple${categoryParam}`;
    
    try {
        const response = await fetch(url); 
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (data.response_code !== 0) {
            throw new Error('No questions available for this category');
        }
       
        // decode html entities and create question objects
        const formattedQuestions = data.results.map(q => {
            const incorrectAnswers = q.incorrect_answers.map(ans => 
                new DOMParser().parseFromString(ans, "text/html").body.textContent
            );
            const correctAnswer = new DOMParser().parseFromString(q.correct_answer, "text/html").body.textContent;
            const choices = [...incorrectAnswers, correctAnswer];
            choices.sort(() => Math.random() - 0.5);

            const questionText = new DOMParser().parseFromString(q.question, "text/html").body.textContent;
            
            return new Question(questionText, choices, correctAnswer, q.difficulty, q.category);
        });
        return formattedQuestions;

    } catch (error) {
        console.error("Could not fetch questions:", error); 
        throw error;
    }
}

// generator function that adjusts difficulty based on previous answers
function* questionGenerator(questions) {
    // split questions by difficulty level
    const easy = questions.filter(q => q.difficulty === 'easy');
    const medium = questions.filter(q => q.difficulty === 'medium');
    const hard = questions.filter(q => q.difficulty === 'hard');
    
    let lastCorrect = null;
    
    // start with a medium question
    if (medium.length > 0) {
        lastCorrect = yield medium.shift();
    }
    
    // keep yilding questions based on if user got last one right
    while (easy.length > 0 || medium.length > 0 || hard.length > 0) {
        let nextQuestion;
        
        //if right give them a harder question
        if (lastCorrect === true) {
            if (hard.length > 0) {
                nextQuestion = hard.shift();
            } else if (medium.length > 0) {
                nextQuestion = medium.shift();
            } else {
                nextQuestion = easy.shift();
            }
        } 
        // if wrong give them an easier question
        else if (lastCorrect === false) {
            if (easy.length > 0) {
                nextQuestion = easy.shift();
            } else if (medium.length > 0) {
                nextQuestion = medium.shift();
            } else {
                nextQuestion = hard.shift();
            }
        } 
        // first question or default to medium
        else {
            if (medium.length > 0) {
                nextQuestion = medium.shift();
            } else if (easy.length > 0) {
                nextQuestion = easy.shift();
            } else {
                nextQuestion = hard.shift();
            }
        }
        
        if (nextQuestion) {
            lastCorrect = yield nextQuestion;
        } else {
            break;
        }
    }
}

// grab all the dom elements we need
const usernameScreen = document.getElementById('username-screen');
const loadingScreen = document.getElementById('loading-screen');
const errorScreen = document.getElementById('error-screen');
const quizScreen = document.getElementById('quiz-screen');
const resultsScreen = document.getElementById('results-screen');
const usernameInput = document.getElementById('username-input');
const categorySelect = document.getElementById('category-select');
const startBtn = document.getElementById('start-btn');
const retryBtn = document.getElementById('retry-btn');
const backBtn = document.getElementById('back-btn');
const restartBtn = document.getElementById('restart-btn');
const questionEl = document.getElementById('question');
const answerButtonsEl = document.getElementById('answer-buttons');
const scoreEl = document.getElementById('score');
const currentUserEl = document.getElementById('current-user');
const difficultyIndicator = document.getElementById('difficulty-indicator');
const finalScoreEl = document.getElementById('final-score');
const historyList = document.getElementById('history-list');
const questionProgress = document.getElementById('question-progress');
const progressFill = document.getElementById('progress-fill');
const errorMessage = document.getElementById('error-message');

// main app class that controls everything
class QuizApp {
    constructor() {
        this.quiz = null;
        this.questionIterator = null;
        this.currentQuestion = null;
        this.user = null;
        this.selectedCategory = '';
        this.categoryName = 'Mixed';

        // using bind to maintain 'this' context in event handlers
        this.handleAnswerClick = this.handleAnswerClick.bind(this);
        this.startQuiz = this.startQuiz.bind(this);
        this.restartQuiz = this.restartQuiz.bind(this);
        this.retryQuiz = this.retryQuiz.bind(this);
        this.backToHome = this.backToHome.bind(this);
        
        this.setupEventListeners();
    }

    // attach all button click listeners
    setupEventListeners() {
        startBtn.addEventListener('click', this.startQuiz);
        restartBtn.addEventListener('click', this.restartQuiz);
        retryBtn.addEventListener('click', this.retryQuiz);
        backBtn.addEventListener('click', this.backToHome);
    }

    // starts the quiz by fetching questions and setting up user
    async startQuiz() {
        const username = usernameInput.value.trim();
        if (!username) {
            alert('Please enter a username!');
            return;
        }
        
        this.selectedCategory = categorySelect.value;
        this.categoryName = categorySelect.options[categorySelect.selectedIndex].text;
        this.user = new User(username);
        currentUserEl.innerText = this.user.username;

        this.showScreen(loadingScreen);

        try {
            const questions = await fetchQuestions(this.selectedCategory);
            this.quiz = new Quiz(questions);
            this.questionIterator = questionGenerator(this.quiz.questions);
            this.showScreen(quizScreen);
            this.showNextQuestion();
        } catch (error) {
            errorMessage.innerText = error.message || 'Failed to load questions. Please try again.';
            this.showScreen(errorScreen);
        }
    }

    retryQuiz() {
        this.startQuiz();
    }

    backToHome() {
        this.showScreen(usernameScreen);
    }

    // hides all screens and shows the one we want
    showScreen(screen) {
        [usernameScreen, loadingScreen, errorScreen, quizScreen, resultsScreen].forEach(s => {
            s.style.display = 'none';
        });
        screen.style.display = 'block';
    }

    // gets next question from generator and displays it
    showNextQuestion(wasCorrect = null) {
        const next = this.questionIterator.next(wasCorrect);
        if (!next.done) {
            this.currentQuestion = next.value;
            this.displayQuestion(this.currentQuestion);
        } else {
            this.showResults();
        }
    }

    // renders the question text, choices, and progress
    displayQuestion(question) {
        // using call to invoke displayInfo with specific context
        const questionInfo = question.displayInfo.call(question, "Current Question");
        console.log(questionInfo);

        questionEl.innerText = question.text;
        difficultyIndicator.innerText = `${question.difficulty.toUpperCase()}`;
        difficultyIndicator.className = `difficulty ${question.difficulty}`;

        // update progress bar
        const current = this.quiz.questionIndex + 1;
        const total = this.quiz.questions.length;
        questionProgress.innerText = `Question ${current}/${total}`;
        const progressPercent = (current / total) * 100;
        //call
        progressFill.style.width = `${progressPercent}%`;
        
        // create answer buttons
        answerButtonsEl.innerHTML = ''; 
        question.choices.forEach(choice => {
            const button = document.createElement('button');
            button.innerText = choice;
            button.classList.add('btn');
            button.addEventListener('click', this.handleAnswerClick); 
            answerButtonsEl.appendChild(button);
        });
        scoreEl.innerText = this.quiz.score;
    }

    // handles when user clicks an answer button
    handleAnswerClick(event) {
        const selectedButton = event.target;
        const answer = selectedButton.innerText;
        
        const isCorrect = this.currentQuestion.isCorrectAnswer(answer);
        this.quiz.checkAnswer(isCorrect);
        
        this.disableAllButtons();
        this.highlightAnswers();
        
        this.quiz.nextQuestion();
        scoreEl.innerText = this.quiz.score;
        
        // delay before next question
        setTimeout(() => this.showNextQuestion(isCorrect), 1500);
    }

    // prevents clicking buttons multiple times
    disableAllButtons() {
        Array.from(answerButtonsEl.children).forEach(button => {
            button.disabled = true;
        });
    }

    // shows which answer was correct/incorrect
    highlightAnswers() {
        Array.from(answerButtonsEl.children).forEach(button => {
            if (this.currentQuestion.isCorrectAnswer(button.innerText)) {
                button.classList.add('correct');
            } else {
                button.classList.add('incorrect');
            }
        });
    }
    
    // displays final score and history when quiz ends
    showResults() {
        // using apply to pass arguments as array
        const stats = this.quiz.calculateStats.apply(
            this.quiz, 
            [this.quiz.correctAnswers, this.quiz.incorrectAnswers]
        );
        console.log('Quiz stats using apply:', stats);
        
        this.user.addScore(this.quiz.score, this.quiz.questions.length, this.categoryName);

        this.showScreen(resultsScreen);
        
        const percentage = Math.round((this.quiz.score / this.quiz.questions.length) * 100);
        finalScoreEl.innerHTML = `
            <strong>${this.user.username}</strong>, your final score is 
            <span class="score-highlight">${this.quiz.score}/${this.quiz.questions.length}</span> 
            (${percentage}%)
        `;
        
        this.displayScoreHistory();
    }

    // shows all previous quiz attempts from localStorage
    displayScoreHistory() {
        historyList.innerHTML = '';
        const history = this.user.getScoreHistory();
        
        if (history.length === 0) {
            historyList.innerHTML = '<li>No previous attempts</li>';
            return;
        }
        
        history.forEach((attempt, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <strong>Attempt ${index + 1}:</strong> 
                ${attempt.score}/${attempt.total} (${attempt.percentage}%) 
                - ${attempt.category}
                <br><small>${attempt.date}</small>
            `;
            historyList.appendChild(li);
        });
    }

    // resets everything and goes back to start
    restartQuiz() {
        this.showScreen(usernameScreen);
        usernameInput.value = '';
        this.quiz = null;
        this.questionIterator = null;
        this.currentQuestion = null;
    }
}

// fire up the app
const app = new QuizApp();