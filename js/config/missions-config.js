(function () {
  const config = {
    missions: [
      {
        id: 'mission-1',
        title: 'Encontrar o caminho',
        description: 'Identifique uma tarefa e escolha ou crie uma para começar.',
        symbol: '✦',
        criteria: 'Responder corretamente e selecionar uma tarefa.',
        question: 'Qual exemplo mostra uma tarefa que pode ser organizada?',
        options: [
          { value: 'study-task', label: 'Resolver 5 problemas de matemática' },
          { value: 'weather', label: 'O céu está azul' },
          { value: 'number', label: 'O número 12' },
        ],
        answer: 'study-task',
        hint: 'Uma tarefa descreve algo que você pode fazer, como resolver exercícios.',
      },
      {
        id: 'mission-2',
        title: 'Preparar a mochila',
        description: 'Organize uma tarefa e escolha uma prioridade.',
        symbol: '⌑',
        criteria: 'Selecionar uma tarefa e confirmar sua prioridade.',
      },
      {
        id: 'mission-3',
        title: 'Acender a lanterna do foco',
        description: 'Acumule pelo menos 3 minutos válidos de foco e conclua a tarefa principal.',
        symbol: '◉',
        criteria: 'Somar 3 minutos válidos de foco na tarefa principal e concluí-la.',
      },
      {
        id: 'mission-4',
        title: 'Resolver o enigma',
        description: 'Responda à pergunta objetiva e escreva uma resposta curta.',
        symbol: '⌘',
        criteria: 'Acertar a pergunta objetiva e fornecer uma resposta curta configurada.',
        question: 'Quantos lados tem um triângulo?',
        options: [
          { value: '2', label: '2 lados' },
          { value: '3', label: '3 lados' },
          { value: '4', label: '4 lados' },
        ],
        answer: '3',
        acceptedShortAnswers: ['três lados', '3 lados'],
        hint: 'Pense na forma geométrica com três segmentos que se encontram.',
      },
      {
        id: 'mission-5',
        title: 'Restaurar o mapa',
        description: 'Crie um plano pessoal, conclua uma tarefa e reveja seu progresso.',
        symbol: '⌖',
        criteria: 'Selecionar e concluir uma tarefa pessoal e consultar o progresso.',
      },
    ],
  };

  if (typeof window !== 'undefined') {
    window.eduEstudos = window.eduEstudos || {};
    window.eduEstudos.missionConfig = config;
  }
})();