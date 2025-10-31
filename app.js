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
    
    console.log(`Question pool - Easy: ${easy.length}, Medium: ${medium.length}, Hard: ${hard.length}`);
    
    let consecutiveCorrect = 0;
    let consecutiveMediumCorrect = 0;
    let currentDifficulty = 'easy';
    let lastAnswer = null;
    
    // Always start with easy question
    if (easy.length > 0) {
        const question = easy.shift();
        console.log(`Starting with EASY question`);
        lastAnswer = yield question;
        
        if (lastAnswer === true) {
            consecutiveCorrect = 1;
        } else {
            consecutiveCorrect = 0;
        }
    }
    
    // Continue with remaining questions
    while (easy.length > 0 || medium.length > 0 || hard.length > 0) {
        let nextQuestion = null;
        
        if (lastAnswer === true) {
            consecutiveCorrect++;
            
            // Update medium streak if we're in medium difficulty
            if (currentDifficulty === 'medium') {
                consecutiveMediumCorrect++;
            }
            
            console.log(`✓ Correct! Streak: ${consecutiveCorrect}, Difficulty: ${currentDifficulty}, Medium streak: ${consecutiveMediumCorrect}`);
            
            // Progress to harder difficulties based on performance
            if (currentDifficulty === 'easy' && consecutiveCorrect >= 2) {
                // Need 2 correct to move to medium
                if (medium.length > 0) {
                    currentDifficulty = 'medium';
                    consecutiveMediumCorrect = 0;
                    nextQuestion = medium.shift();
                    console.log(`→ Moving to MEDIUM difficulty`);
                } else {
                    nextQuestion = easy.shift() || hard.shift();
                }
            } else if (currentDifficulty === 'medium' && consecutiveMediumCorrect >= 3) {
                // Need 3 correct mediums to move to hard
                if (hard.length > 0) {
                    currentDifficulty = 'hard';
                    nextQuestion = hard.shift();
                    console.log(`→ Moving to HARD difficulty`);
                } else {
                    nextQuestion = medium.shift() || easy.shift();
                }
            } else {
                // Stay at current difficulty
                if (currentDifficulty === 'easy' && easy.length > 0) {
                    nextQuestion = easy.shift();
                } else if (currentDifficulty === 'medium' && medium.length > 0) {
                    nextQuestion = medium.shift();
                } else if (currentDifficulty === 'hard' && hard.length > 0) {
                    nextQuestion = hard.shift();
                } else {
                    // Fallback to any available
                    nextQuestion = easy.shift() || medium.shift() || hard.shift();
                }
            }
        } else if (lastAnswer === false) {
            // Wrong answer - drop down difficulty
            consecutiveCorrect = 0;
            
            console.log(`✗ Wrong! Dropping difficulty from ${currentDifficulty}`);
            
            if (currentDifficulty === 'hard') {
                // Drop to medium
                currentDifficulty = 'medium';
                consecutiveMediumCorrect = 0;
                nextQuestion = medium.shift() || easy.shift() || hard.shift();
                console.log(`→ Dropped to MEDIUM`);
            } else if (currentDifficulty === 'medium') {
                // Drop to easy
                currentDifficulty = 'easy';
                consecutiveMediumCorrect = 0;
                nextQuestion = easy.shift() || medium.shift() || hard.shift();
                console.log(`→ Dropped to EASY`);
            } else {
                // Already at easy, stay there
                nextQuestion = easy.shift() || medium.shift() || hard.shift();
                console.log(`→ Staying at EASY`);
            }
        } else {
            // Should not happen, but fallback
            nextQuestion = easy.shift() || medium.shift() || hard.shift();
        }
        
        if (nextQuestion) {
            console.log(`Next question [${nextQuestion.difficulty.toUpperCase()}]`);
            lastAnswer = yield nextQuestion;
        } else {
            console.log('No more questions available');
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
const hintBtn = document.getElementById('hint-btn');

class QuizApp {
    constructor() {
        this.quiz = null;
        this.questionIterator = null;
        this.currentQuestion = null;
        this.user = null;
        this.selectedCategory = '';
        this.categoryName = 'Mixed';
        this.correctStreak = 0;
        this.hintsRemaining = 3;
        this.usedHintOnCurrentQuestion = false;

        this.handleAnswerClick = this.handleAnswerClick.bind(this);
        this.startQuiz = this.startQuiz.bind(this);
        this.restartQuiz = this.restartQuiz.bind(this);
        this.retryQuiz = this.retryQuiz.bind(this);
        this.backToHome = this.backToHome.bind(this);
        this.use5050Hint = this.use5050Hint.bind(this);
        
        this.setupEventListeners();
        this.initSpotlightEffect();
        this.createParticles();
    }

    setupEventListeners() {
        startBtn.addEventListener('click', this.startQuiz);
        restartBtn.addEventListener('click', this.restartQuiz);
        retryBtn.addEventListener('click', this.retryQuiz);
        backBtn.addEventListener('click', this.backToHome);
        hintBtn.addEventListener('click', this.use5050Hint);
    }

    // Spotlight and grid effect that follows mouse
    initSpotlightEffect() {
        const containers = document.querySelectorAll('.quiz-container');
        
        containers.forEach(container => {
            container.addEventListener('mousemove', (e) => {
                const rect = container.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                
                container.style.setProperty('--mouse-x', `${x}%`);
                container.style.setProperty('--mouse-y', `${y}%`);
            });
        });
    }

    // Create floating particles in background
    createParticles() {
        const particleContainer = document.createElement('div');
        particleContainer.className = 'particle-container';
        document.body.appendChild(particleContainer);

        for (let i = 0; i < 30; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.top = `${Math.random() * 100}%`;
            particle.style.animationDelay = `${Math.random() * 20}s`;
            particle.style.animationDuration = `${15 + Math.random() * 10}s`;
            
            // Random colors for particles
            const colors = [
                'rgba(6, 182, 212, 0.6)',    // cyan
                'rgba(236, 72, 153, 0.6)',   // pink
                'rgba(0, 255, 157, 0.6)'     // green
            ];
            particle.style.background = colors[Math.floor(Math.random() * colors.length)];
            particle.style.boxShadow = `0 0 10px ${colors[Math.floor(Math.random() * colors.length)]}`;
            
            particleContainer.appendChild(particle);
        }
    }

    use5050Hint() {
        if (this.hintsRemaining <= 0 || this.usedHintOnCurrentQuestion) {
            return;
        }

        const buttons = Array.from(answerButtonsEl.children);
        const correctButton = buttons.find(btn => 
            this.currentQuestion.isCorrectAnswer(btn.innerText)
        );
        
        const incorrectButtons = buttons.filter(btn => 
            !this.currentQuestion.isCorrectAnswer(btn.innerText)
        );

        // Remove 2 incorrect answers
        const toRemove = incorrectButtons.slice(0, 2);
        toRemove.forEach(btn => {
            btn.style.opacity = '0.3';
            btn.style.pointerEvents = 'none';
            btn.style.textDecoration = 'line-through';
        });

        this.hintsRemaining--;
        this.usedHintOnCurrentQuestion = true;
        this.updateHintButton();
    }

    updateHintButton() {
        const hintBtn = document.getElementById('hint-btn');
        if (hintBtn) {
            hintBtn.innerText = `💡 50/50 Hint (${this.hintsRemaining} left)`;
            if (this.hintsRemaining <= 0) {
                hintBtn.disabled = true;
                hintBtn.style.opacity = '0.4';
            } else if (this.usedHintOnCurrentQuestion) {
                hintBtn.disabled = true;
                hintBtn.style.opacity = '0.4';
            } else {
                hintBtn.disabled = false;
                hintBtn.style.opacity = '1';
            }
        }
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
        this.hintsRemaining = 3;
        this.correctStreak = 0;
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

        this.usedHintOnCurrentQuestion = false;

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

        // Update hint button
        this.updateHintButton();
    }

    handleAnswerClick(event) {
        const selectedButton = event.target;
        const answer = selectedButton.innerText;
        
        const isCorrect = this.currentQuestion.isCorrectAnswer(answer);
        this.quiz.checkAnswer(isCorrect);
        
        // Track streak silently
        if (isCorrect) {
            this.correctStreak++;
        } else {
            this.correctStreak = 0;
        }
        
        this.disableAllButtons();
        this.highlightAnswers();
        
        // Add celebratory effect for correct answers
        if (isCorrect) {
            this.createSuccessEffect(selectedButton);
        }
        
        this.quiz.nextQuestion();
        scoreEl.innerText = this.quiz.score;
        
        setTimeout(() => this.showNextQuestion(isCorrect), 1500);
    }

    createSuccessEffect(button) {
        const rect = button.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let i = 0; i < 12; i++) {
            const particle = document.createElement('div');
            particle.style.position = 'fixed';
            particle.style.left = `${centerX}px`;
            particle.style.top = `${centerY}px`;
            particle.style.width = '6px';
            particle.style.height = '6px';
            particle.style.borderRadius = '50%';
            particle.style.background = '#00ff9d';
            particle.style.boxShadow = '0 0 10px #00ff9d';
            particle.style.pointerEvents = 'none';
            particle.style.zIndex = '1000';
            
            const angle = (Math.PI * 2 * i) / 12;
            const velocity = 100 + Math.random() * 50;
            const vx = Math.cos(angle) * velocity;
            const vy = Math.sin(angle) * velocity;
            
            document.body.appendChild(particle);
            
            let x = 0, y = 0;
            const animate = () => {
                x += vx * 0.016;
                y += vy * 0.016 + 200 * 0.016; // gravity
                
                particle.style.transform = `translate(${x}px, ${y}px)`;
                particle.style.opacity = Math.max(0, 1 - y / 300);
                
                if (parseFloat(particle.style.opacity) > 0) {
                    requestAnimationFrame(animate);
                } else {
                    particle.remove();
                }
            };
            
            animate();
        }
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
        
        // Positive messages based on score
        let encouragement = '';
        if (percentage === 100) {
            encouragement = "Perfect score! You're a genius! 🏆";
        } else if (percentage >= 80) {
            encouragement = "Outstanding performance! 🌟";
        } else if (percentage >= 60) {
            encouragement = "Great job! You're doing awesome! 🎉";
        } else if (percentage >= 40) {
            encouragement = "Good effort! Keep practicing! 💪";
        } else {
            encouragement = "Every quiz makes you smarter! Try again! 🚀";
        }

        finalScoreEl.innerHTML = `
            <strong>${this.user.username}</strong>, your final score is 
            <span class="score-highlight">${this.quiz.score}/${this.quiz.questions.length}</span> 
            (${percentage}%)
            <br><br>
            <span style="font-size: 1.1em; color: #00ff9d;">${encouragement}</span>
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
        this.correctStreak = 0;
        this.hintsRemaining = 3;
    }
}

const app = new QuizApp();