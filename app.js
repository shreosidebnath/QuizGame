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

    displayInfo(prefix) {
        return `${prefix}: ${this.text} [${this.difficulty}]`;
    }
}

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

    calculateStats(...args) {
        const total = args.reduce((sum, val) => sum + val, 0);
        return {
            total,
            average: total / args.length
        };
    }
}

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

function* questionGenerator(questions) {
    const easy = questions.filter(q => q.difficulty === 'easy');
    const medium = questions.filter(q => q.difficulty === 'medium');
    const hard = questions.filter(q => q.difficulty === 'hard');
    
    let lastCorrect = null;
    
    if (medium.length > 0) {
        lastCorrect = yield medium.shift();
    }
    
    while (easy.length > 0 || medium.length > 0 || hard.length > 0) {
        let nextQuestion;
        
        if (lastCorrect === true) {
            if (hard.length > 0) {
                nextQuestion = hard.shift();
            } else if (medium.length > 0) {
                nextQuestion = medium.shift();
            } else {
                nextQuestion = easy.shift();
            }
        } 
        else if (lastCorrect === false) {
            if (easy.length > 0) {
                nextQuestion = easy.shift();
            } else if (medium.length > 0) {
                nextQuestion = medium.shift();
            } else {
                nextQuestion = hard.shift();
            }
        } 
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

class QuizApp {
    constructor() {
        this.quiz = null;
        this.questionIterator = null;
        this.currentQuestion = null;
        this.user = null;
        this.selectedCategory = '';
        this.categoryName = 'Mixed';

        this.handleAnswerClick = this.handleAnswerClick.bind(this);
        this.startQuiz = this.startQuiz.bind(this);
        this.restartQuiz = this.restartQuiz.bind(this);
        this.retryQuiz = this.retryQuiz.bind(this);
        this.backToHome = this.backToHome.bind(this);
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        startBtn.addEventListener('click', this.startQuiz);
        restartBtn.addEventListener('click', this.restartQuiz);
        retryBtn.addEventListener('click', this.retryQuiz);
        backBtn.addEventListener('click', this.backToHome);
    }

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

    showScreen(screen) {
        [usernameScreen, loadingScreen, errorScreen, quizScreen, resultsScreen].forEach(s => {
            s.style.display = 'none';
        });
        screen.style.display = 'block';
    }

    showNextQuestion(wasCorrect = null) {
        const next = this.questionIterator.next(wasCorrect);
        if (!next.done) {
            this.currentQuestion = next.value;
            this.displayQuestion(this.currentQuestion);
        } else {
            this.showResults();
        }
    }

    displayQuestion(question) {
        const questionInfo = question.displayInfo.call(question, "Current Question");
        console.log(questionInfo);

        questionEl.innerText = question.text;
        difficultyIndicator.innerText = `${question.difficulty.toUpperCase()}`;
        difficultyIndicator.className = `difficulty ${question.difficulty}`;

        const current = this.quiz.questionIndex + 1;
        const total = this.quiz.questions.length;
        questionProgress.innerText = `Question ${current}/${total}`;
        const progressPercent = (current / total) * 100;
        progressFill.style.width = `${progressPercent}%`;
        
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

    handleAnswerClick(event) {
        const selectedButton = event.target;
        const answer = selectedButton.innerText;
        
        const isCorrect = this.currentQuestion.isCorrectAnswer(answer);
        this.quiz.checkAnswer(isCorrect);
        
        this.disableAllButtons();
        this.highlightAnswers();
        
        this.quiz.nextQuestion();
        scoreEl.innerText = this.quiz.score;
        
        setTimeout(() => this.showNextQuestion(isCorrect), 1500);
    }

    disableAllButtons() {
        Array.from(answerButtonsEl.children).forEach(button => {
            button.disabled = true;
        });
    }

    highlightAnswers() {
        Array.from(answerButtonsEl.children).forEach(button => {
            if (this.currentQuestion.isCorrectAnswer(button.innerText)) {
                button.classList.add('correct');
            } else {
                button.classList.add('incorrect');
            }
        });
    }
    
    showResults() {
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

    restartQuiz() {
        this.showScreen(usernameScreen);
        usernameInput.value = '';
        this.quiz = null;
        this.questionIterator = null;
        this.currentQuestion = null;
    }
}

const app = new QuizApp();