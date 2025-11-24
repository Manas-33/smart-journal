import { LLMService } from './llm_service';

export class Processor {
    private llmService: LLMService;

    constructor(llmService: LLMService) {
        this.llmService = llmService;
    }

    async generateTags(noteContent: string): Promise<string[]> {
        const prompt = `Analyze the following journal note and suggest 3-5 relevant tags. Return ONLY the tags as a comma-separated list, without any explanation or numbering, also if the tags have spaces, replace them with hyphens.
        
        Note Content:
        ${noteContent}`;

        const response = await this.llmService.completion([{ role: "user", content: prompt }]);
        return response.split(',').map(tag => tag.trim());
    }

    async extractActionItems(noteContent: string): Promise<string[]> {
        const prompt = `Identify any action items, to-dos, or tasks in the following journal note. Return them as a list of strings. If there are no action items, return "None".
        
        Note Content:
        ${noteContent}`;

        const response = await this.llmService.completion([{ role: "user", content: prompt }]);
        if (response.trim() === "None") return [];
        
        return response.split('\n').filter(line => line.trim().length > 0);
    }

    async summarizeWeekly(notes: string[]): Promise<string> {
        const joinedNotes = notes.join('\n\n---\n\n');
        const prompt = `Summarize the following journal notes from the past week. Highlight key events, themes, and progress.
        
        Notes:
        ${joinedNotes}`;

        return await this.llmService.completion([{ role: "user", content: prompt }]);
    }
}
