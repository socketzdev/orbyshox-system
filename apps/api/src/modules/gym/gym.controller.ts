import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UnauthorizedException } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { canRead, canCreate, canUpdate, canDelete } from '../../common/rbac/policies';
import { GymService } from './gym.service';
import { GymGateway, GymTopic } from './gym.gateway';

@Controller('gym')
export class GymController {
  constructor(
    private readonly gymService: GymService,
    private readonly gateway: GymGateway,
  ) {}

  private ctx(user: any): { companyId?: string; tenantId?: string } {
    const companyId = user?.companyId;
    const tenantId = user?.tenantId;
    if (!companyId && !tenantId) {
      throw new UnauthorizedException('Usuário não vinculado a uma empresa ou estabelecimento.');
    }
    return { companyId, tenantId };
  }

  /**
   * Executa a escrita e SÓ DEPOIS avisa as telas (pós-commit — nunca
   * notificar algo que pode sofrer rollback). Sem gateway/server: no-op.
   */
  private async live<T>(topics: GymTopic[], tenantId: string | undefined, work: Promise<T>): Promise<T> {
    const res = await work;
    for (const t of topics) this.gateway.notify(tenantId, t);
    return res;
  }

  private tidOf(companyId?: string, tenantId?: string): string | undefined {
    return tenantId || companyId;
  }

  // ─── Dashboard / relatórios ───
  @Get('dashboard')
  @CheckPolicies(canRead('GymStudent'))
  async dashboard(@CurrentUser() user: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.gymService.dashboard(companyId, tenantId);
  }

  @Get('reports')
  @CheckPolicies(canRead('GymStudent'))
  async reports(@CurrentUser() user: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.gymService.reports(companyId, tenantId);
  }

  // ─── Alunos ───
  @Get('students')
  @CheckPolicies(canRead('GymStudent'))
  async listStudents(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const { companyId, tenantId } = this.ctx(user);
    return this.gymService.listStudents(companyId, tenantId, { search, status });
  }

  @Get('students/:id')
  @CheckPolicies(canRead('GymStudent'))
  async getStudent(@CurrentUser() user: any, @Param('id') id: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.gymService.getStudent(companyId, tenantId, id);
  }

  @Post('students')
  @CheckPolicies(canCreate('GymStudent'))
  async createStudent(@CurrentUser() user: any, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['students', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.createStudent(companyId, tenantId, dto));
  }

  @Patch('students/:id')
  @CheckPolicies(canUpdate('GymStudent'))
  async updateStudent(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['students', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.updateStudent(companyId, tenantId, id, dto));
  }

  @Delete('students/:id')
  @CheckPolicies(canDelete('GymStudent'))
  async deleteStudent(@CurrentUser() user: any, @Param('id') id: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['students', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.deleteStudent(companyId, tenantId, id));
  }

  // ─── Matrículas ───
  @Get('enrollments')
  @CheckPolicies(canRead('GymEnrollment'))
  async listEnrollments(@CurrentUser() user: any, @Query('status') status?: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.gymService.listEnrollments(companyId, tenantId, status);
  }

  @Post('enrollments')
  @CheckPolicies(canCreate('GymEnrollment'))
  async createEnrollment(@CurrentUser() user: any, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['enrollments', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.createEnrollment(companyId, tenantId, dto));
  }

  @Patch('enrollments/:id/status')
  @CheckPolicies(canUpdate('GymEnrollment'))
  async setEnrollmentStatus(@CurrentUser() user: any, @Param('id') id: string, @Body('status') status: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['enrollments', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.setEnrollmentStatus(companyId, tenantId, id, status));
  }

  // ─── Check-in ───
  @Get('checkins/today')
  @CheckPolicies(canRead('GymCheckIn'))
  async todayCheckIns(@CurrentUser() user: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.gymService.todayCheckIns(companyId, tenantId);
  }

  @Post('checkins')
  @CheckPolicies(canCreate('GymCheckIn'))
  async checkIn(@CurrentUser() user: any, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(
      ['checkins', 'dashboard'],
      this.tidOf(companyId, tenantId),
      this.gymService.checkIn(companyId, tenantId, String(dto?.studentId || ''), String(dto?.method || 'MANUAL')),
    );
  }

  @Get('students/:id/checkins')
  @CheckPolicies(canRead('GymCheckIn'))
  async studentHistory(@CurrentUser() user: any, @Param('id') id: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.gymService.studentHistory(companyId, tenantId, id);
  }

  // ─── Biblioteca de movimentos ───
  @Get('exercises')
  @CheckPolicies(canRead('GymWorkout'))
  async listExercises(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('muscleGroup') muscleGroup?: string,
  ) {
    const { companyId, tenantId } = this.ctx(user);
    return this.gymService.listExercises(companyId, tenantId, { search, muscleGroup });
  }

  @Post('exercises')
  @CheckPolicies(canCreate('GymWorkout'))
  async createExercise(@CurrentUser() user: any, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['exercises'], this.tidOf(companyId, tenantId), this.gymService.createExercise(companyId, tenantId, dto));
  }

  @Patch('exercises/:id')
  @CheckPolicies(canUpdate('GymWorkout'))
  async updateExercise(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['exercises'], this.tidOf(companyId, tenantId), this.gymService.updateExercise(companyId, tenantId, id, dto));
  }

  @Delete('exercises/:id')
  @CheckPolicies(canDelete('GymWorkout'))
  async deleteExercise(@CurrentUser() user: any, @Param('id') id: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['exercises'], this.tidOf(companyId, tenantId), this.gymService.deleteExercise(companyId, tenantId, id));
  }

  @Post('exercises/seed-defaults')
  @CheckPolicies(canCreate('GymWorkout'))
  async seedDefaultExercises(@CurrentUser() user: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['exercises'], this.tidOf(companyId, tenantId), this.gymService.seedDefaultExercises(companyId, tenantId));
  }

  @Post('exercises/fill-media')
  @CheckPolicies(canUpdate('GymWorkout'))
  async fillMissingExerciseMedia(@CurrentUser() user: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['exercises'], this.tidOf(companyId, tenantId), this.gymService.fillMissingExerciseMedia(companyId, tenantId));
  }

  @Post('exercises/import-dataset')
  @CheckPolicies(canCreate('GymWorkout'))
  async importDataset(@CurrentUser() user: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['exercises'], this.tidOf(companyId, tenantId), this.gymService.importDataset(companyId, tenantId));
  }

  // ─── Treinos ───
  @Get('workouts')
  @CheckPolicies(canRead('GymWorkout'))
  async listWorkouts(
    @CurrentUser() user: any,
    @Query('studentId') studentId?: string,
    @Query('dayOfWeek') dayOfWeek?: string,
  ) {
    const { companyId, tenantId } = this.ctx(user);
    return this.gymService.listWorkouts(companyId, tenantId, studentId, dayOfWeek);
  }

  @Get('workouts/:id')
  @CheckPolicies(canRead('GymWorkout'))
  async getWorkout(@CurrentUser() user: any, @Param('id') id: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.gymService.getWorkout(companyId, tenantId, id);
  }

  @Post('workouts')
  @CheckPolicies(canCreate('GymWorkout'))
  async createWorkout(@CurrentUser() user: any, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['workouts', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.createWorkout(companyId, tenantId, dto));
  }

  @Patch('workouts/:id')
  @CheckPolicies(canUpdate('GymWorkout'))
  async updateWorkout(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['workouts', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.updateWorkout(companyId, tenantId, id, dto));
  }

  // ─── Avaliação física ───
  @Get('assessments')
  @CheckPolicies(canRead('GymWorkout'))
  async listAssessments(@CurrentUser() user: any, @Query('studentId') studentId?: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.gymService.listAssessments(companyId, tenantId, studentId);
  }

  @Get('assessments/:id')
  @CheckPolicies(canRead('GymWorkout'))
  async getAssessment(@CurrentUser() user: any, @Param('id') id: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.gymService.getAssessment(companyId, tenantId, id);
  }

  @Post('assessments')
  @CheckPolicies(canCreate('GymWorkout'))
  async createAssessment(@CurrentUser() user: any, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['assessments', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.createAssessment(companyId, tenantId, dto));
  }

  @Patch('assessments/:id')
  @CheckPolicies(canUpdate('GymWorkout'))
  async updateAssessment(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['assessments', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.updateAssessment(companyId, tenantId, id, dto));
  }

  @Delete('assessments/:id')
  @CheckPolicies(canDelete('GymWorkout'))
  async deleteAssessment(@CurrentUser() user: any, @Param('id') id: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['assessments', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.deleteAssessment(companyId, tenantId, id));
  }

  @Post('workouts/:id/duplicate')
  @CheckPolicies(canCreate('GymWorkout'))
  async duplicateWorkout(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['workouts', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.duplicateWorkout(companyId, tenantId, id, dto));
  }

  @Delete('workouts/:id')
  @CheckPolicies(canDelete('GymWorkout'))
  async deleteWorkout(@CurrentUser() user: any, @Param('id') id: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['workouts', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.deleteWorkout(companyId, tenantId, id));
  }

  // ─── Aulas ───
  @Get('classes')
  @CheckPolicies(canRead('GymClass'))
  async listClasses(@CurrentUser() user: any, @Query('upcoming') upcoming?: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.gymService.listClasses(companyId, tenantId, upcoming === 'true' || upcoming === '1');
  }

  @Post('classes')
  @CheckPolicies(canCreate('GymClass'))
  async createClass(@CurrentUser() user: any, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['classes', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.createClass(companyId, tenantId, dto));
  }

  @Delete('classes/:id')
  @CheckPolicies(canDelete('GymClass'))
  async deleteClass(@CurrentUser() user: any, @Param('id') id: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['classes', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.deleteClass(companyId, tenantId, id));
  }

  @Post('classes/:id/book')
  @CheckPolicies(canCreate('GymClass'))
  async bookClass(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['classes', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.bookClass(companyId, tenantId, id, String(dto?.studentId || '')));
  }

  @Patch('bookings/:id/status')
  @CheckPolicies(canUpdate('GymClass'))
  async setBookingStatus(@CurrentUser() user: any, @Param('id') id: string, @Body('status') status: string) {
    const { companyId, tenantId } = this.ctx(user);
    return this.live(['classes', 'dashboard'], this.tidOf(companyId, tenantId), this.gymService.setBookingStatus(companyId, tenantId, id, status));
  }
}
